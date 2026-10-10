CREATE SCHEMA IF NOT EXISTS locations;

-- Explicit ECMAScript trim whitespace, independent of database locale classification.
CREATE FUNCTION locations.valid_reference_name(value text) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT char_length(btrim(value, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) BETWEEN 1 AND 200
$$;

CREATE TABLE locations.reference_metadata (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  data_mode text NOT NULL CHECK (data_mode = 'synthetic-stub'),
  fixture_version text NOT NULL,
  as_of timestamptz NOT NULL
);

CREATE TABLE locations.place (
  place_id uuid PRIMARY KEY DEFAULT uuidv7() CHECK (uuid_extract_version(place_id) = 7),
  public_id text NOT NULL UNIQUE CHECK (public_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(public_id) <= 200),
  kind text NOT NULL CHECK (kind IN ('country','state','city','zone','neighborhood','street-block')),
  name_en text NOT NULL CHECK (locations.valid_reference_name(name_en)),
  name_pt_br text NOT NULL CHECK (locations.valid_reference_name(name_pt_br)),
  normalized_name text NOT NULL CHECK (char_length(normalized_name) BETWEEN 1 AND 200),
  state_code text CHECK (state_code ~ '^[a-z]{2}$'),
  parent_id uuid,
  parent_kind text,
  sibling_order integer NOT NULL CHECK (sibling_order >= 0),
  prepared_property_count integer NOT NULL CHECK (prepared_property_count >= 0),
  latitude double precision,
  longitude double precision,
  street_name text,
  normalized_street text,
  from_number numeric,
  to_number numeric,
  block_origin text,
  UNIQUE (place_id, kind),
  FOREIGN KEY (parent_id, parent_kind) REFERENCES locations.place(place_id, kind),
  -- Strictly descending kinds make cycles impossible, even during parent updates.
  CHECK (
    (kind = 'country' AND parent_id IS NULL AND parent_kind IS NULL) OR
    (kind <> 'country' AND parent_id IS NOT NULL AND parent_kind IS NOT NULL AND
      parent_kind = CASE kind WHEN 'state' THEN 'country' WHEN 'city' THEN 'state'
        WHEN 'zone' THEN 'city' WHEN 'neighborhood' THEN 'zone' WHEN 'street-block' THEN 'neighborhood' END)
  ),
  CHECK ((kind = 'state') = (state_code IS NOT NULL)),
  CHECK ((latitude IS NULL AND longitude IS NULL) OR
    (latitude IS NOT NULL AND longitude IS NOT NULL AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)),
  CHECK (
    (kind <> 'street-block' AND street_name IS NULL AND normalized_street IS NULL AND from_number IS NULL AND to_number IS NULL AND block_origin IS NULL) OR
    (kind = 'street-block' AND street_name IS NOT NULL AND locations.valid_reference_name(street_name)
      AND normalized_street IS NOT NULL AND char_length(normalized_street) BETWEEN 1 AND 200
      AND from_number IS NOT NULL AND to_number IS NOT NULL AND from_number BETWEEN 0 AND 9007199254740991
      AND to_number BETWEEN from_number AND 9007199254740991
      AND from_number = trunc(from_number) AND to_number = trunc(to_number)
      AND block_origin IS NOT NULL AND block_origin = 'prepared-fixture')
  )
);
CREATE INDEX place_parent_order ON locations.place(parent_id, sibling_order, public_id);
CREATE INDEX place_street_lookup ON locations.place(normalized_street, parent_id) WHERE kind = 'street-block';

-- One undirected pair produces both directions on reads and cannot register a self edge.
CREATE TABLE locations.neighborhood_adjacency (
  first_id uuid NOT NULL,
  second_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'neighborhood' CHECK (kind = 'neighborhood'),
  PRIMARY KEY (first_id, second_id),
  CHECK (first_id < second_id),
  FOREIGN KEY (first_id, kind) REFERENCES locations.place(place_id, kind),
  FOREIGN KEY (second_id, kind) REFERENCES locations.place(place_id, kind)
);

INSERT INTO locations.reference_metadata (data_mode, fixture_version, as_of)
VALUES ('synthetic-stub', 'synthetic-sao-paulo-v1', '2026-10-01T12:00:00.000Z');

INSERT INTO locations.place (public_id,kind,name_en,name_pt_br,normalized_name,state_code,parent_id,parent_kind,sibling_order,prepared_property_count)
VALUES ('brazil','country','Brazil','Brasil','brasil',NULL,NULL,NULL,0,5);
INSERT INTO locations.place (public_id,kind,name_en,name_pt_br,normalized_name,state_code,parent_id,parent_kind,sibling_order,prepared_property_count)
SELECT 'sao-paulo-state','state','São Paulo state','Estado de São Paulo','estado de sao paulo','sp',place_id,'country',1,5 FROM locations.place WHERE public_id='brazil';
INSERT INTO locations.place (public_id,kind,name_en,name_pt_br,normalized_name,parent_id,parent_kind,sibling_order,prepared_property_count)
SELECT 'sao-paulo','city','São Paulo','São Paulo','sao paulo',place_id,'state',2,5 FROM locations.place WHERE public_id='sao-paulo-state';
INSERT INTO locations.place (public_id,kind,name_en,name_pt_br,normalized_name,parent_id,parent_kind,sibling_order,prepared_property_count)
SELECT seed.public_id,'zone',seed.name_en,seed.name_pt_br,seed.normalized_name,parent.place_id,'city',seed.ordinal,1
FROM (VALUES
  ('sao-paulo-centro','Central zone','Zona Centro','zona centro',3),
  ('sao-paulo-norte','North zone','Zona Norte','zona norte',4),
  ('sao-paulo-sul','South zone','Zona Sul','zona sul',5),
  ('sao-paulo-leste','East zone','Zona Leste','zona leste',6),
  ('sao-paulo-oeste','West zone','Zona Oeste','zona oeste',7)
) AS seed(public_id,name_en,name_pt_br,normalized_name,ordinal)
CROSS JOIN locations.place parent WHERE parent.public_id='sao-paulo';
INSERT INTO locations.place (public_id,kind,name_en,name_pt_br,normalized_name,parent_id,parent_kind,sibling_order,prepared_property_count)
SELECT seed.public_id,'neighborhood',seed.name,seed.name,seed.normalized_name,parent.place_id,'zone',seed.ordinal,1
FROM (VALUES
  ('sao-paulo-bela-vista','Bela Vista','bela vista','sao-paulo-centro',8),
  ('sao-paulo-santana','Santana','santana','sao-paulo-norte',9),
  ('sao-paulo-vila-mariana','Vila Mariana','vila mariana','sao-paulo-sul',10),
  ('sao-paulo-tatuape','Tatuapé','tatuape','sao-paulo-leste',11),
  ('sao-paulo-pinheiros','Pinheiros','pinheiros','sao-paulo-oeste',12)
) AS seed(public_id,name,normalized_name,parent_public_id,ordinal)
JOIN locations.place parent ON parent.public_id=seed.parent_public_id;
INSERT INTO locations.place (public_id,kind,name_en,name_pt_br,normalized_name,parent_id,parent_kind,sibling_order,prepared_property_count,latitude,longitude,street_name,normalized_street,from_number,to_number,block_origin)
SELECT seed.public_id,'street-block',seed.name_en,seed.name_pt_br,seed.normalized_name,parent.place_id,'neighborhood',seed.ordinal,seed.prepared_count,seed.latitude,seed.longitude,seed.street,seed.normalized_street,100,199,'prepared-fixture'
FROM (VALUES
  ('sao-paulo-bela-vista-fictional-block','Fictional Bela Vista block','Quarteirão fictício Bela Vista','quarteirao ficticio bela vista','sao-paulo-bela-vista',13,1,-23.55::double precision,-46.63::double precision,'Rua Cenário Um','rua cenario um'),
  ('sao-paulo-pinheiros-fictional-block','Fictional Pinheiros block','Quarteirão fictício Pinheiros','quarteirao ficticio pinheiros','sao-paulo-pinheiros',14,1,-23.560000000000002,-46.620000000000005,'Rua Cenário Seis','rua cenario seis'),
  ('sao-paulo-santana-fictional-block','Fictional Santana block','Quarteirão fictício Santana','quarteirao ficticio santana','sao-paulo-santana',15,1,-23.57,-46.61,'Rua Cenário Três','rua cenario tres'),
  ('sao-paulo-vila-mariana-fictional-block','Fictional Vila Mariana block','Quarteirão fictício Vila Mariana','quarteirao ficticio vila mariana','sao-paulo-vila-mariana',16,1,-23.580000000000002,-46.6,'Rua Cenário Quatro','rua cenario quatro'),
  ('sao-paulo-tatuape-fictional-block','Fictional Tatuapé block','Quarteirão fictício Tatuapé','quarteirao ficticio tatuape','sao-paulo-tatuape',17,1,-23.59,-46.59,'Rua Cenário Cinco','rua cenario cinco'),
  ('sao-paulo-bela-vista-avenida-exemplo-fictional-block','Fictional Avenida Exemplo block','Quarteirão fictício Avenida Exemplo','quarteirao ficticio avenida exemplo','sao-paulo-bela-vista',18,0,NULL,NULL,'Avenida Exemplo','avenida exemplo'),
  ('sao-paulo-vila-mariana-rua-cenario-um-fictional-block','Fictional Vila Mariana Rua Cenário Um block','Quarteirão fictício Vila Mariana Rua Cenário Um','quarteirao ficticio vila mariana rua cenario um','sao-paulo-vila-mariana',19,0,NULL,NULL,'Rua Cenário Um','rua cenario um')
) AS seed(public_id,name_en,name_pt_br,normalized_name,parent_public_id,ordinal,prepared_count,latitude,longitude,street,normalized_street)
JOIN locations.place parent ON parent.public_id=seed.parent_public_id;
INSERT INTO locations.neighborhood_adjacency (first_id,second_id)
SELECT least(a.place_id,b.place_id),greatest(a.place_id,b.place_id)
FROM locations.place a CROSS JOIN locations.place b
WHERE a.public_id='sao-paulo-bela-vista' AND b.public_id='sao-paulo-vila-mariana';
