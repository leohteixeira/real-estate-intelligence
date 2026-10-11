import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../../apps/api/node_modules/reflect-metadata');
const order = process.argv[2];
if (!order) throw new Error('The import-order probe requires module order.');
const modules = (JSON.parse(order) as Array<'properties' | 'locations'>).map((context) => {
  const value = require('../../apps/api/dist/' + context + '/' + context + '.module.js') as {
    PropertiesModule?: object;
    LocationsModule?: object;
  };
  const module = value[context === 'properties' ? 'PropertiesModule' : 'LocationsModule'];
  if (!module) throw new Error('The requested compiled module was not exported.');
  return {
    context,
    importsDefined: (Reflect.getMetadata('imports', module) as unknown[]).every(Boolean),
  };
});
console.log(JSON.stringify(modules));
