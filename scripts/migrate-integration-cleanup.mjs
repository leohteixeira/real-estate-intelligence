import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';

// Mechanical, scope-preserving finally hardening. Keep return/catch semantics in
// the original function; aggregate failures and execute every cleanup statement.
for (const name of readdirSync('integration').filter((name) =>
  name.endsWith('.integration.test.mjs'),
)) {
  const path = `integration/${name}`;
  const source = ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  let index = 0;
  const result = ts.transform(source, [
    (context) => {
      const factory = context.factory;
      const parse = (text) => {
        const generated = ts.createSourceFile(
          'generated.mjs',
          text,
          ts.ScriptTarget.Latest,
          false,
          ts.ScriptKind.JS,
        );
        const synthetic = (node) => {
          ts.setTextRange(node, { pos: -1, end: -1 });
          ts.forEachChild(node, synthetic);
        };
        synthetic(generated);
        return generated.statements;
      };
      // Generated nodes have synthetic ranges. Do not copy unrelated source-position
      // comments into their output when printing nested cleanup replacements.
      const printer = ts.createPrinter({ removeComments: true });
      const print = (node) => printer.printNode(ts.EmitHint.Unspecified, node, source);
      const unswallow = (node) => {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === 'catch' &&
          node.arguments.length === 1 &&
          ts.isArrowFunction(node.arguments[0]) &&
          node.arguments[0].body.kind === ts.SyntaxKind.Identifier &&
          node.arguments[0].body.text === 'undefined'
        )
          return ts.visitNode(node.expression.expression, unswallow);
        return ts.visitEachChild(node, unswallow, context);
      };
      const visit = (node) => {
        const changed = ts.visitEachChild(node, visit, context);
        if (!ts.isTryStatement(changed) || !changed.finallyBlock) return changed;
        const id = ++index;
        const work = factory.updateTryStatement(
          changed,
          changed.tryBlock,
          changed.catchClause,
          undefined,
        );
        // A bare try without catch is represented directly by its body.
        const body = changed.catchClause
          ? print(work)
          : changed.tryBlock.statements.map(print).join('\n');
        const statements = [...changed.finallyBlock.statements];
        const declaration = statements.findIndex(ts.isVariableStatement);
        const groups =
          declaration < 0
            ? statements.map((statement) => [statement])
            : [
                ...statements.slice(0, declaration).map((statement) => [statement]),
                statements.slice(declaration),
              ];
        const tasks = groups
          .map(
            (group) =>
              `async () => { ${group.map((statement) => print(ts.visitNode(statement, unswallow))).join('\n')} }`,
          )
          .join(',\n');
        return parse(`{
        let cleanupPrimary${id}; let cleanupPrimaryThrown${id} = false;
        try { ${body} } catch (error) { cleanupPrimary${id} = error; cleanupPrimaryThrown${id} = true; throw error; }
        finally { await preserveCleanup(async () => { if (cleanupPrimaryThrown${id}) throw cleanupPrimary${id}; }, async () => { await cleanupAll(${tasks}); }); }
      }`)[0];
      };
      return (node) => ts.visitNode(node, visit);
    },
  ]);
  if (index) {
    let text = ts.createPrinter().printFile(result.transformed[0]);
    text = text.replace(
      /import \{([^}]+)\} from ['"]\.\/support\/fixture\.mjs['"];/,
      (_, names) =>
        `import { ${names.trim()}, preserveCleanup, cleanupAll } from './support/fixture.mjs';`,
    );
    writeFileSync(path, text);
  }
  result.dispose();
}
