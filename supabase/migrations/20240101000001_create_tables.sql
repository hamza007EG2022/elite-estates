CREATE TABLE IF NOT EXISTS properties (
  id bigint PRIMARY KEY,
  "titleAr" text,
  "titleEn" text,
  type text,
  location text,
  price numeric,
  beds integer,
  baths integer,
  area numeric,
  "finAr" text,
  "finEn" text,
  "descAr" text,
  "descEn" text,
  images jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leads (
  id bigint PRIMARY KEY,
  name text,
  phone text,
  notes text,
  date text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_knowledge (
  id bigint PRIMARY KEY,
  topic text,
  content text,
  status text DEFAULT 'active',
  image text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE properties REPLICA IDENTITY FULL;
ALTER TABLE leads REPLICA IDENTITY FULL;
ALTER TABLE ai_knowledge REPLICA IDENTITY FULL;
