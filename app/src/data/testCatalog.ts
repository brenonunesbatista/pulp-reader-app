// Test helper: a tiny catalog built from the real schema (tools/catalog/schema.sql), with FTS rows filled the same
// way tools/catalog/db.py fills them.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Db } from '../db/types'
import { memoryDb } from '../db/wasmDb'

const SCHEMA = readFileSync(fileURLToPath(new URL('../../../tools/catalog/schema.sql', import.meta.url)), 'utf8')

export async function testCatalog(): Promise<Db> {
  const db = await memoryDb()
  await db.exec(SCHEMA)
  await db.exec(`
    INSERT INTO magazine VALUES (1, 'Amazing Stories', 'amazing-stories', 'test');
    INSERT INTO person VALUES (1, 'Clement Fezandié'), (2, 'Ellen E. Frewer'), (3, 'Frank R. Paul'),
      (4, 'H. G. Wells'), (5, 'Hugo Gernsback'), (6, 'Jules Verne'), (7, 'Eando Binder'), (8, 'Leo Morey');
    INSERT INTO issue VALUES
      (1, 1, 'amazing-stories-1926-04', 1926, 4, 'Amazing Stories, April 1926', 1, 1, 'Frank R. Paul', 'Hugo Gernsback',
       'AmazingStoriesVolume01Number01', 'ia', 'covers/amazing-stories-1926-04.webp', NULL),
      (2, 1, 'amazing-stories-1932-11', 1932, 11, 'Amazing Stories, November 1932', NULL, NULL, 'Leo Morey', NULL,
       NULL, 'none', 'covers/amazing-stories-1932-11.webp', NULL),
      (3, 1, 'amazing-stories-1940-03', 1940, 3, 'Amazing Stories, March 1940', 14, 3, 'Frank R. Paul', NULL,
       'Amazing_Stories_v14n03_1940-03_cape1736', 'ia', 'covers/amazing-stories-1940-03.webp', NULL);
    INSERT INTO story VALUES
      (1, 1, 'A New Sort of Magazine', NULL, 'ed', 'editorial', 3, 4, 1, NULL),
      (2, 1, 'Off on a Comet', 'Part 1 of 2', 'n.', 'novel', 4, 5, 2, NULL),
      (3, 1, 'The New Accelerator', NULL, 'ss', 'short story', 57, 58, 3, NULL),
      (4, 2, 'Doctor Hackensaw''s Secrets', NULL, 'ss', 'short story', 280, NULL, 1, NULL),
      (5, 3, 'The First Martian', NULL, 'nv', 'novelette', 651, 80, 1, 'Eando Binder = Earl Binder & Otto O. Binder'),
      (6, 3, 'The Time Machine Returns', NULL, 'ss', 'short story', 90, 91, 2, NULL);
    INSERT INTO story_person VALUES (1, 5, 'author', 'Hugo Gernsback'), (2, 6, 'author', 'Jules Verne'),
      (2, 2, 'translator', 'Ellen E. Frewer'), (3, 4, 'author', 'H. G. Wells'), (4, 1, 'author', 'Clement Fezandié'),
      (5, 7, 'author', 'Eando Binder'), (6, 4, 'author', 'H.G. Wells');
    INSERT INTO issue_person VALUES (1, 3, 'cover_artist', 'Frank R. Paul'), (1, 5, 'editor', 'Hugo Gernsback'),
      (2, 8, 'cover_artist', 'Leo Morey'), (3, 3, 'cover_artist', 'Frank R. Paul');
    INSERT INTO issue_fts (rowid, magazine, title, year, month, cover_artist, editor) VALUES
      (1, 'Amazing Stories', 'Amazing Stories, April 1926', '1926', 'April', 'Frank R. Paul', 'Hugo Gernsback'),
      (2, 'Amazing Stories', 'Amazing Stories, November 1932', '1932', 'November', 'Leo Morey', ''),
      (3, 'Amazing Stories', 'Amazing Stories, March 1940', '1940', 'March', 'Frank R. Paul', '');
    INSERT INTO story_fts (rowid, title, series, authors, translators, type_label, issue_title) VALUES
      (1, 'A New Sort of Magazine', '', 'Hugo Gernsback', '', 'editorial', 'Amazing Stories, April 1926'),
      (2, 'Off on a Comet', '', 'Jules Verne', 'Ellen E. Frewer', 'novel', 'Amazing Stories, April 1926'),
      (3, 'The New Accelerator', '', 'H. G. Wells', '', 'short story', 'Amazing Stories, April 1926'),
      (4, 'Doctor Hackensaw''s Secrets', '', 'Clement Fezandié', '', 'short story', 'Amazing Stories, November 1932'),
      (5, 'The First Martian', '', 'Eando Binder Eando Binder = Earl Binder & Otto O. Binder', '', 'novelette',
       'Amazing Stories, March 1940'),
      (6, 'The Time Machine Returns', '', 'H. G. Wells', '', 'short story', 'Amazing Stories, March 1940');
    INSERT INTO person_fts (rowid, name, roles) VALUES (1, 'Clement Fezandié', 'author'), (2, 'Ellen E. Frewer', 'translator'),
      (3, 'Frank R. Paul', 'cover artist'), (4, 'H. G. Wells', 'author'), (5, 'Hugo Gernsback', 'author editor'),
      (6, 'Jules Verne', 'author'), (7, 'Eando Binder', 'author'), (8, 'Leo Morey', 'cover artist');
  `)
  return db
}
