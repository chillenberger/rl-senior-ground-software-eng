import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'

export const DEFAULT_DATABASE_PATH = ':memory:'

export const SCHEMA = readFileSync(join(__dirname, 'schema.sql'), 'utf8')

export type SqliteDatabase = Database.Database

export function openDatabase (filename: string = DEFAULT_DATABASE_PATH): SqliteDatabase {
  const db = new Database(filename)
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  return db
}


