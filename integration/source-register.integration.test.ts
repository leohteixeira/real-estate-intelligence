import { expect, test } from 'vitest';
import { DatabaseConnection } from '../packages/infrastructure/dist/index.js';
import { coordinateSourceRegisterCleanup } from './source-register-cleanup.ts';
import { allocatePorts, withCampaign } from './support/fixture.ts';
import { requestHttp } from './support/http.ts';

test('source-register preserves its complete real-service campaign', async () => {
  await withCampaign(async ({ command }) => {
    const exec = command;
    const projectName = `rei-source-register-${process.pid}`;
    const database = 'rei_source_register_fixture';
    const user = 'rei_source_register_fixture';
    const password = 'rei-source-register-postgres-fixture';

    const [
      postgresPort,
      apiPort,
      rabbitPort,
      rabbitManagementPort,
      minioPort,
      minioConsolePort,
      aiPort,
      webPort,
      valkeyPort,
    ] = await allocatePorts(9);
    const environment = {
      ...process.env,
      COMPOSE_DISABLE_ENV_FILE: '1',
      COMPOSE_ENV_FILES: '',
      COMPOSE_PROFILES: 'tools',
      NODE_ENV: 'test',
      POSTGRES_DB: database,
      POSTGRES_USER: user,
      POSTGRES_PASSWORD: password,
      POSTGRES_PORT: String(postgresPort),
      API_PORT: String(apiPort),
      RABBITMQ_PORT: String(rabbitPort),
      RABBITMQ_MANAGEMENT_PORT: String(rabbitManagementPort),
      MINIO_API_PORT: String(minioPort),
      MINIO_CONSOLE_PORT: String(minioConsolePort),
      AI_PORT: String(aiPort),
      WEB_PORT: String(webPort),
      VALKEY_PORT: String(valkeyPort),
      RABBITMQ_USER: 'unused-source-register',
      RABBITMQ_PASSWORD: 'unused-source-register',
      RABBITMQ_VHOST: 'unused-source-register',
      MINIO_ROOT_USER: 'unused-source-register',
      MINIO_ROOT_PASSWORD: 'unused-source-register',
      OBJECT_STORE_REGION: 'us-east-1',
      OBJECT_STORE_BUCKET: 'unused-source-register',
      WORKER_OPERATION_TIMEOUT_MS: '5000',
      OTEL_EXPORTER_OTLP_ENDPOINT: '',
    };
    const databaseUrl = new URL('postgres://127.0.0.1');
    databaseUrl.username = user;
    databaseUrl.password = password;
    databaseUrl.port = String(postgresPort);
    databaseUrl.pathname = `/${database}`;
    const expectedSeed = [
      [
        'caixa-property-list',
        'listing',
        false,
        false,
        false,
        false,
        '2026-10-09T00:00:00.000Z',
        'not-verified',
        'remote-http',
        'unconfigured',
        null,
        null,
        'not-verified',
        null,
        null,
      ],
      [
        'chaves-na-mao',
        'listing',
        false,
        false,
        false,
        false,
        '2026-10-09T00:00:00.000Z',
        'forbidden',
        'remote-http',
        'unconfigured',
        null,
        null,
        'not-verified',
        null,
        null,
      ],
      [
        'geosampa-fiscal-blocks',
        'reference-geography',
        false,
        true,
        false,
        false,
        '2026-10-09T00:00:00.000Z',
        'allowed',
        'remote-http',
        'unconfigured',
        null,
        null,
        'licensed',
        'CC BY-SA 4.0',
        'https://creativecommons.org/licenses/by-sa/4.0/',
      ],
      [
        'geosampa-iptu',
        'cadastral-file',
        false,
        false,
        false,
        false,
        '2026-10-09T00:00:00.000Z',
        'allowed',
        'manual-download',
        'not-applicable',
        null,
        null,
        'licensed',
        'CC BY-SA 4.0',
        'https://creativecommons.org/licenses/by-sa/4.0/',
      ],
      [
        'imovelweb',
        'listing',
        false,
        false,
        false,
        false,
        '2026-10-09T00:00:00.000Z',
        'not-verified',
        'remote-http',
        'unconfigured',
        null,
        null,
        'not-verified',
        null,
        null,
      ],
      [
        'loft',
        'listing',
        false,
        false,
        false,
        false,
        '2026-10-09T00:00:00.000Z',
        'not-verified',
        'remote-http',
        'unconfigured',
        null,
        null,
        'not-verified',
        null,
        null,
      ],
      [
        'mercado-livre',
        'listing',
        false,
        false,
        false,
        false,
        '2026-10-09T00:00:00.000Z',
        'not-verified',
        'remote-http',
        'unconfigured',
        null,
        null,
        'not-verified',
        null,
        null,
      ],
      [
        'olx',
        'listing',
        false,
        false,
        false,
        false,
        '2026-10-09T00:00:00.000Z',
        'forbidden',
        'remote-http',
        'unconfigured',
        null,
        null,
        'not-verified',
        null,
        null,
      ],
      [
        'quintoandar',
        'listing',
        false,
        false,
        false,
        false,
        '2026-10-09T00:00:00.000Z',
        'forbidden',
        'remote-http',
        'unconfigured',
        null,
        null,
        'not-verified',
        null,
        null,
      ],
      [
        'sao-paulo-itbi-transactions',
        'transaction',
        false,
        false,
        false,
        false,
        '2026-10-09T00:00:00.000Z',
        'not-verified',
        'remote-http',
        'unconfigured',
        null,
        null,
        'not-verified',
        null,
        null,
      ],
      [
        'synthetic-data',
        'synthetic-listing',
        true,
        true,
        true,
        true,
        null,
        'not-required',
        'repository-fixture',
        'not-applicable',
        null,
        null,
        'not-applicable',
        'Synthetic data',
        null,
      ],
      [
        'viva-real',
        'listing',
        false,
        false,
        false,
        false,
        '2026-10-09T00:00:00.000Z',
        'not-verified',
        'remote-http',
        'unconfigured',
        null,
        null,
        'not-verified',
        null,
        null,
      ],
      [
        'zap-imoveis',
        'listing',
        false,
        false,
        false,
        false,
        '2026-10-09T00:00:00.000Z',
        'not-verified',
        'remote-http',
        'unconfigured',
        null,
        null,
        'not-verified',
        null,
        null,
      ],
    ] as const;
    const expectedSeedDetails = [
      [
        'caixa-property-list',
        'Caixa property list',
        'No terms or licence granting reuse were found; written permission is still required.',
        'Publisher-hosted state CSV download.',
        null,
      ],
      [
        'chaves-na-mao',
        'Chaves na Mão',
        'Reviewed terms forbid bots and scraping; the assistant endpoint does not authorize storage.',
        'Public website and assistant endpoint; neither permits scheduled storage.',
        null,
      ],
      [
        'geosampa-fiscal-blocks',
        'GeoSampa fiscal blocks',
        'CC BY-SA 4.0 review; reference geography only and not ingested in the MVP.',
        'Published WFS endpoint; product use is deferred to the V2 block layer.',
        null,
      ],
      [
        'geosampa-iptu',
        'GeoSampa IPTU base',
        'CC BY-SA 4.0 review; human download is CAPTCHA-bound and the cadastre is not used.',
        'A person may download the file; automation must not work around the CAPTCHA.',
        null,
      ],
      [
        'imovelweb',
        'Imovelweb',
        'The terms could not be read and no permission for collection was established.',
        'Public website; current access policy unverified.',
        null,
      ],
      [
        'loft',
        'Loft',
        'No terms addressed to visitors were found and no permission was established.',
        'Public website; visitor access policy unverified.',
        null,
      ],
      [
        'mercado-livre',
        'Mercado Livre',
        'General and developer terms could not be read; no permission was established.',
        'Public website and authenticated developer interface.',
        null,
      ],
      [
        'olx',
        'OLX',
        'Reviewed terms forbid web crawling and reuse without prior express authorization.',
        'Public website; no authorized collection interface.',
        null,
      ],
      [
        'quintoandar',
        'QuintoAndar',
        'Reviewed terms forbid extracting data by web scraping and copying content.',
        'Public website; no authorized collection interface.',
        null,
      ],
      [
        'sao-paulo-itbi-transactions',
        'São Paulo ITBI transactions',
        'The publisher page states no licence; written reuse permission is still required.',
        'Publisher-hosted spreadsheet download.',
        null,
      ],
      [
        'synthetic-data',
        'Labelled synthetic fixture',
        'Repository-owned deterministic fixture containing no personal data or photographs.',
        'Checked-in deterministic fixture; no external access occurs.',
        '2026-10-10T00:00:00.000Z',
      ],
      [
        'viva-real',
        'Viva Real',
        'Terms pages were unreadable and no permission for collection was established.',
        'Public website; current access policy unverified.',
        null,
      ],
      [
        'zap-imoveis',
        'ZAP Imóveis',
        'Current terms could not be read; no permission for collection was established.',
        'Public website; current access policy unverified.',
        null,
      ],
    ] as const;
    function compose(...args: string[]) {
      return ['compose', '--project-name', projectName, '--profile', 'tools', ...args];
    }
    async function execute(file: string, args: string[], timeout = 180_000) {
      return exec(file, args, {
        cwd: new URL('..', import.meta.url),
        env: environment,
        timeout,
        maxBuffer: 10 * 1024 * 1024,
      });
    }

    async function assertSqlRejected(
      connection: DatabaseConnection,
      statement: string | undefined,
      message: string | undefined,
    ) {
      let rejected = false;
      try {
        await connection.query(statement!);
      } catch {
        rejected = true;
      }
      expect(rejected, message).toBeTruthy();
    }
    async function runEnable(sourceId: string, shouldSucceed = true) {
      try {
        const result = await execute('docker', compose('run', '--rm', 'source-enable', sourceId));
        if (!shouldSucceed) throw new Error(`Source ${sourceId} unexpectedly enabled.`);
        return `${result.stdout}${result.stderr}`;
      } catch (error) {
        if (shouldSucceed) throw error;
        const output = `${error instanceof Error && 'stdout' in error ? error.stdout : ''}${error instanceof Error && 'stderr' in error ? error.stderr : ''}`;
        expect(
          output.length < 10_000,
          'Operator failure output was unexpectedly unbounded.',
        ).toBeTruthy();
        expect(
          !output.includes(password),
          'Operator failure leaked database configuration.',
        ).toBeTruthy();
        return output;
      }
    }
    async function main() {
      let connection: DatabaseConnection;
      let primaryFailure: unknown;
      let primaryThrown = false;
      try {
        expect(
          new Set([
            postgresPort,
            apiPort,
            rabbitPort,
            rabbitManagementPort,
            minioPort,
            minioConsolePort,
            aiPort,
            webPort,
            valkeyPort,
          ]).size === 9,
          'Campaign ports must be unique.',
        ).toBeTruthy();
        await execute(
          'docker',
          compose('up', '--detach', '--build', '--wait', 'postgres', 'migrations', 'api'),
          300_000,
        );
        await execute('docker', compose('build', 'source-enable'), 300_000);
        connection = new DatabaseConnection(databaseUrl.toString());

        const seed = await connection.query<{
          source_id: string;
          source_label: string;
          source_category: string;
          enabled: boolean;
          enabled_at: Date;
          collection_allowed: boolean;
          image_fetching_allowed: boolean;
          listing_text_display_allowed: boolean;
          permission_evidence: unknown;
          reviewed_at: Date;
          review_outcome: string;
          access_method: string;
          access_policy: unknown;
          rate_status: string;
          rate_limit: string;
          rate_window_seconds: string;
          licence_status: string;
          licence_label: string;
          licence_url: string;
        }>(
          `SELECT source_id, source_label, source_category, enabled, enabled_at,
              collection_allowed, image_fetching_allowed, listing_text_display_allowed,
              permission_evidence, reviewed_at, review_outcome, access_method, access_policy,
              rate_status, rate_limit,
              rate_window_seconds, licence_status, licence_label, licence_url
         FROM collection.source_register
        ORDER BY source_id`,
        );
        const runtimeFixtureIds = [
          'synthetic-portal-aurora',
          'synthetic-portal-brisa',
          'synthetic-portal-cobalto',
        ];
        expect(
          seed.length === 16,
          `Expected 16 registered sources, received ${seed.length}.`,
        ).toBeTruthy();
        const reviewedSeed = seed.filter((source) => !runtimeFixtureIds.includes(source.source_id));
        expect(
          reviewedSeed.length === 13,
          'The thirteen-source reviewed candidate audit changed.',
        ).toBeTruthy();
        const seedSnapshot = reviewedSeed.map((source) => [
          source.source_id,
          source.source_category,
          source.enabled,
          source.collection_allowed,
          source.image_fetching_allowed,
          source.listing_text_display_allowed,
          source.reviewed_at?.toISOString() ?? null,
          source.review_outcome,
          source.access_method,
          source.rate_status,
          source.rate_limit,
          source.rate_window_seconds,
          source.licence_status,
          source.licence_label,
          source.licence_url,
        ]);
        expect(
          JSON.stringify(seedSnapshot) === JSON.stringify(expectedSeed),
          `Source register seed does not match the reviewed snapshot: ${JSON.stringify(seedSnapshot)}`,
        ).toBeTruthy();
        const seedDetails = reviewedSeed.map((source) => [
          source.source_id,
          source.source_label,
          source.permission_evidence,
          source.access_policy,
          source.enabled_at?.toISOString() ?? null,
        ]);
        expect(
          JSON.stringify(seedDetails) === JSON.stringify(expectedSeedDetails),
          `Source register seed details do not match the reviewed snapshot: ${JSON.stringify(seedDetails)}`,
        ).toBeTruthy();
        expect(
          seed
            .filter((source) => source.enabled)
            .map((source) => source.source_id)
            .join(',') ===
            'synthetic-data,synthetic-portal-aurora,synthetic-portal-brisa,synthetic-portal-cobalto',
          'A real reviewed candidate was enabled by the seed.',
        ).toBeTruthy();
        expect(
          seed
            .filter((source) => runtimeFixtureIds.includes(source.source_id))
            .every(
              (source) =>
                source.enabled &&
                source.source_category === 'synthetic-listing' &&
                source.review_outcome === 'not-required' &&
                source.access_method === 'repository-fixture',
            ),
          'A runtime fixture alias does not satisfy the closed owned-fixture policy.',
        ).toBeTruthy();

        await connection.query(
          `INSERT INTO collection.source_register
        (source_id, source_label, source_category, enabled, enabled_at,
         collection_allowed, image_fetching_allowed, listing_text_display_allowed,
         permission_evidence, reviewed_at, review_outcome, access_method, access_policy,
         rate_status, rate_limit, rate_window_seconds, licence_status, licence_label, licence_url)
       VALUES
        ('unreviewed-fixture', 'Unreviewed fixture', 'listing', false, NULL,
         true, false, false, 'No review.', NULL, 'not-verified', 'remote-http', 'Test endpoint.',
         'configured', 1, 60, 'licensed', 'Fixture licence', 'https://example.invalid/licence'),
        ('eligible-fixture', 'Eligible fixture', 'listing', false, NULL,
         true, false, true, 'Controlled integration fixture.', '2026-10-09T00:00:00Z', 'allowed',
         'remote-http', 'Controlled test endpoint.', 'configured', 1, 60,
         'licensed', 'Fixture licence', 'https://example.invalid/licence')`,
        );

        const refusal = await runEnable('unreviewed-fixture', false);
        expect(
          refusal.includes('review-not-verified'),
          'The command did not return the stable refusal.',
        ).toBeTruthy();
        const refused = await connection.query<{ enabled: boolean; enabled_at: Date }>(
          `SELECT enabled, enabled_at FROM collection.source_register WHERE source_id = 'unreviewed-fixture'`,
        );
        expect(
          refused[0]?.enabled === false && refused[0]?.enabled_at === null,
          'Refusal changed the row.',
        ).toBeTruthy();

        const supportedLicenceUrl =
          'HTTPS://valid-host.example:65535/licence/path?scope=read#terms';
        await connection.query(
          `UPDATE collection.source_register
          SET licence_url = $1
        WHERE source_id = 'eligible-fixture'`,
          [supportedLicenceUrl],
        );
        const storedLicence = await connection.query<{ licence_url: string }>(
          `SELECT licence_url FROM collection.source_register WHERE source_id = 'eligible-fixture'`,
        );
        expect(
          storedLicence[0]?.licence_url === supportedLicenceUrl,
          'The database rejected or rewrote a licence URL in the shared grammar.',
        ).toBeTruthy();

        for (const [statement, message] of [
          [
            `UPDATE collection.source_register
            SET review_outcome = 'allowed', reviewed_at = NULL
          WHERE source_id = 'unreviewed-fixture'`,
            'The database accepted an allowed review without a date.',
          ],
          [
            `UPDATE collection.source_register
            SET rate_status = 'configured', rate_limit = NULL, rate_window_seconds = NULL
          WHERE source_id = 'unreviewed-fixture'`,
            'The database accepted an incomplete configured rate.',
          ],
          [
            `UPDATE collection.source_register
            SET licence_status = 'licensed', licence_label = NULL, licence_url = NULL
          WHERE source_id = 'unreviewed-fixture'`,
            'The database accepted an incomplete licensed tuple.',
          ],
          [
            `UPDATE collection.source_register
            SET source_category = 'synthetic-listing'
          WHERE source_id = 'unreviewed-fixture'`,
            'The database accepted a non-owned synthetic identity.',
          ],
          [
            `UPDATE collection.source_register
            SET collection_allowed = NULL
          WHERE source_id = 'unreviewed-fixture'`,
            'The database accepted a null permission.',
          ],
          [
            `UPDATE collection.source_register
            SET enabled = true, enabled_at = NULL
          WHERE source_id = 'unreviewed-fixture'`,
            'The database accepted an enabled row without enablement time.',
          ],
          [
            `UPDATE collection.source_register
            SET enabled = false, enabled_at = NULL, rate_status = 'unconfigured'
          WHERE source_id = 'synthetic-data'`,
            'The database accepted a contradictory disabled synthetic policy.',
          ],
          [
            `UPDATE collection.source_register
            SET licence_url = 'ftp://example.invalid/licence'
          WHERE source_id = 'eligible-fixture'`,
            'The database accepted a non-HTTP licence URL.',
          ],
          [
            `UPDATE collection.source_register
            SET licence_url = 'https://user:secret@example.invalid/licence'
          WHERE source_id = 'eligible-fixture'`,
            'The database accepted a licence URL containing credentials.',
          ],
          [
            `UPDATE collection.source_register
            SET licence_url = 'https://%'
          WHERE source_id = 'eligible-fixture'`,
            'The database accepted an invalid percent hostname.',
          ],
          [
            `UPDATE collection.source_register
            SET licence_url = 'https://['
          WHERE source_id = 'eligible-fixture'`,
            'The database accepted an invalid bracket hostname.',
          ],
          [
            `UPDATE collection.source_register
            SET licence_url = 'https://example.invalid:99999/licence'
          WHERE source_id = 'eligible-fixture'`,
            'The database accepted an out-of-range URL port.',
          ],
          [
            `UPDATE collection.source_register
            SET licence_url = 'https://bad-.example/licence'
          WHERE source_id = 'eligible-fixture'`,
            'The database accepted a malformed DNS hostname label.',
          ],
          [
            `UPDATE collection.source_register
            SET licence_url = 'https://bad..example/licence'
          WHERE source_id = 'eligible-fixture'`,
            'The database accepted an empty DNS hostname label.',
          ],
          [
            `UPDATE collection.source_register
            SET licence_url = 'https://127.0.0.1/licence'
          WHERE source_id = 'eligible-fixture'`,
            'The database accepted a numeric IPv4 hostname.',
          ],
          [
            `UPDATE collection.source_register
            SET licence_url = 'https://127.1/licence'
          WHERE source_id = 'eligible-fixture'`,
            'The database accepted an abbreviated numeric IP-like hostname.',
          ],
          [
            `UPDATE collection.source_register
            SET licence_url = 'https://2130706433/licence'
          WHERE source_id = 'eligible-fixture'`,
            'The database accepted an integer IP-like hostname.',
          ],
        ] as const) {
          await assertSqlRejected(connection, statement, message);
        }

        await Promise.all([runEnable('eligible-fixture'), runEnable('eligible-fixture')]);
        const first = await connection.query<{ enabled: boolean; enabled_at: Date }>(
          `SELECT enabled, enabled_at FROM collection.source_register WHERE source_id = 'eligible-fixture'`,
        );
        expect(
          first[0]?.enabled === true && first[0]?.enabled_at instanceof Date,
          'Eligible fixture was not enabled.',
        ).toBeTruthy();
        const firstTimestamp = first![0]!.enabled_at.toISOString();
        await runEnable('eligible-fixture');
        const replay = await connection.query<{ enabled_at: Date }>(
          `SELECT enabled_at FROM collection.source_register WHERE source_id = 'eligible-fixture'`,
        );
        expect(
          replay[0]?.enabled_at.toISOString() === firstTimestamp,
          'Repeated enablement rewrote enabled_at.',
        ).toBeTruthy();

        const response = await requestHttp(`http://127.0.0.1:${apiPort}/api/v1/collection/sources`);
        expect(
          response.status === 200,
          `Enabled-source API returned ${response.status}.`,
        ).toBeTruthy();
        const body = (await response.json()) as { sources: { sourceId: string }[] };
        expect(
          JSON.stringify(body.sources.map((source) => source.sourceId)) ===
            JSON.stringify([
              'eligible-fixture',
              'synthetic-data',
              'synthetic-portal-aurora',
              'synthetic-portal-brisa',
              'synthetic-portal-cobalto',
            ]),
          `Enabled-source API returned an unexpected set: ${JSON.stringify(body)}`,
        ).toBeTruthy();
        expect(
          !/review|rate|access|evidence|enabledAt/i.test(JSON.stringify(body)),
          'API leaked internal policy metadata.',
        ).toBeTruthy();

        await assertSqlRejected(
          connection,
          `UPDATE collection.source_register
            SET enabled = true, enabled_at = clock_timestamp()
          WHERE source_id = 'unreviewed-fixture'`,
          'The database accepted a direct enable that bypassed the review gate.',
        );
      } catch (error) {
        primaryFailure = error;
        primaryThrown = true;
        await execute('docker', compose('logs', '--no-color'), 30_000)
          .then(({ stdout, stderr }) => process.stderr.write(`${stdout}${stderr}`))
          .catch(() => undefined);
      }

      await coordinateSourceRegisterCleanup({
        primaryFailure,
        primaryThrown,
        close: async () => connection?.close(),
        down: async () =>
          execute('docker', compose('down', '--volumes', '--remove-orphans'), 120_000),
        onSuccess: async () => console.log('Source register integration passed.'),
      });
    }
    await main();
  });
});
