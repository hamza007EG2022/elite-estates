const { Client } = require('pg');

const REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1',
  'eu-north-1', 'ca-central-1',
  'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2',
  'ap-south-1', 'sa-east-1'
];

const SQL = `
  CREATE TABLE IF NOT EXISTS properties (
    id bigint PRIMARY KEY,
    "titleAr" text, "titleEn" text, type text, location text,
    price numeric, beds integer, baths integer, area numeric,
    "finAr" text, "finEn" text, "descAr" text, "descEn" text,
    images jsonb DEFAULT '[]'::jsonb,
    created_at timestamptz DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS leads (
    id bigint PRIMARY KEY,
    name text, phone text, notes text, date text,
    created_at timestamptz DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS ai_knowledge (
    id bigint PRIMARY KEY,
    topic text, content text, status text DEFAULT 'active',
    image text DEFAULT '', created_at timestamptz DEFAULT now()
  );
  ALTER TABLE properties REPLICA IDENTITY FULL;
  ALTER TABLE leads REPLICA IDENTITY FULL;
  ALTER TABLE ai_knowledge REPLICA IDENTITY FULL;
`;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  
  const { host, port, database, user, password, ref } = JSON.parse(event.body);
  const projectRef = ref || '';
  const dbPassword = password || '';
  
  // Try all regions
  for (const region of REGIONS) {
    try {
      const client = new Client({
        host: host || ('aws-0-' + region + '.pooler.supabase.com'),
        port: port || 6543,
        database: database || 'postgres',
        user: user || ('postgres.' + projectRef),
        password: dbPassword,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 8000
      });
      await client.connect();
      await client.query(SQL);
      const r = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
      await client.end();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, region, tables: r.rows.map(x => x.table_name) })
      };
    } catch (e) {
      if (region === REGIONS[REGIONS.length - 1]) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ success: false, lastError: e.message, lastRegion: region })
        };
      }
    }
  }
};
