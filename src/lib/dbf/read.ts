// Schema-agnostic dBase III/IV-family .dbf reader: field names/types/
// lengths are read straight from the file's own header, so it works on
// any .dbf regardless of what its columns mean.
import type { DbfField, DbfFieldType, DbfRow, DbfTable } from './types';

interface RawFieldDescriptor {
  fieldName: string;
  fieldType: string;
  fieldLength: number;
  fieldDecimalCount: number;
}

const FILE_HEADER_SIZE = 31;
const FIELD_DESCRIPTOR_SIZE = 32;
const NUL = String.fromCharCode(0);

function readFieldsInfo(dbaseFile: Uint8Array): RawFieldDescriptor[] {
  const fields: RawFieldDescriptor[] = [];
  const dec = new TextDecoder('latin1');
  let byteRead: number;
  let i = 0;
  do {
    byteRead = FILE_HEADER_SIZE + i * FIELD_DESCRIPTOR_SIZE + 1;
    let fieldNameLength = 0;
    while (
      String.fromCharCode(dbaseFile[byteRead + fieldNameLength]) !== NUL &&
      fieldNameLength < 11
    ) {
      fieldNameLength += 1;
    }
    const fieldName = dec.decode(dbaseFile.subarray(byteRead, byteRead + fieldNameLength));
    byteRead += 11;
    const fieldType = String.fromCharCode(dbaseFile[byteRead]);
    byteRead += 1;
    byteRead += 4; // reserved
    const fieldLength = dbaseFile[byteRead];
    byteRead += 1;
    const decimalCount = dbaseFile[byteRead];
    byteRead += 1;
    fields.push({ fieldName, fieldType, fieldLength, fieldDecimalCount: decimalCount });
    byteRead += 14; // not required to read
    i += 1;
  } while (String.fromCharCode(dbaseFile[byteRead]) !== '\r');
  return fields;
}

function getDateValue(value: string): Date | null {
  if (value.length === 8 && /^\d{8}$/.test(value)) {
    const year = value.slice(0, 4);
    const month = value.slice(4, 6);
    const date = value.slice(6, 8);
    return new Date(+year, +month - 1, +date);
  }
  return null;
}

function julianIntToDate(jd: number): Date {
  let l = jd + 68569;
  const n = Math.floor(Math.floor(4 * l) / 146097);
  l = l - Math.floor((146097 * n + 3) / 4);
  const i = Math.floor((4000 * (l + 1)) / 1461001);
  l = l - Math.floor((1461 * i) / 4) + 31;
  const j = Math.floor((80 * l) / 2447);
  const k = l - Math.floor((2447 * j) / 80);
  const m = Math.floor(j / 11);
  const month = j + 2 - 12 * m;
  const year = 100 * (n - 49) + i + m;
  const date = new Date(year, month, k);
  date.setMonth(date.getMonth() - 1);
  return date;
}

function getFieldValue(
  valueBuffer: Uint8Array,
  type: string,
  decimalCount: number,
  fieldLength: number,
): unknown {
  const dec = new TextDecoder('latin1');
  let value: unknown = dec.decode(valueBuffer).trim();
  try {
    switch (type.trim().toLowerCase()) {
      case 'q':
      case 'c':
        break;
      case 'v': {
        let valueLength = 0;
        while (
          String.fromCharCode(valueBuffer[valueLength]) !== NUL &&
          valueLength < fieldLength
        ) {
          valueLength += 1;
        }
        value = dec.decode(valueBuffer.subarray(0, valueLength)).trim();
        break;
      }
      case 'd':
        value = getDateValue(value as string);
        break;
      case 'f':
      case 'n':
        value = +(value as string);
        break;
      case 'l':
        value =
          (value as string).toLowerCase() === 'y' || (value as string).toLowerCase() === 't';
        break;
      case 'g':
      case 'i': {
        const view = new DataView(valueBuffer.buffer, valueBuffer.byteOffset, valueBuffer.byteLength);
        value = view.getInt32(0, true);
        break;
      }
      case 'y': {
        const view = new DataView(valueBuffer.buffer, valueBuffer.byteOffset, valueBuffer.byteLength);
        let currency = view.getInt32(0, true).toString();
        currency =
          currency.slice(0, currency.length - decimalCount) +
          '.' +
          currency.slice(currency.length - decimalCount, 2 * currency.length - decimalCount - 4);
        value = +currency;
        break;
      }
      case 'b': {
        const view = new DataView(valueBuffer.buffer, valueBuffer.byteOffset, valueBuffer.byteLength);
        value = view.getFloat64(0, true);
        break;
      }
      case 't': {
        const view = new DataView(valueBuffer.buffer, valueBuffer.byteOffset, valueBuffer.byteLength);
        const dateWord = view.getInt32(0, true);
        const duration = view.getInt32(4, true);
        const seconds = Math.floor((duration / 1000) % 60);
        const minutes = Math.floor((duration / (1000 * 60)) % 60);
        const hours = Math.floor((duration / (1000 * 60 * 60)) % 24);
        const date = julianIntToDate(dateWord);
        value = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, seconds);
        break;
      }
    }
  } catch (error) {
    console.error(error);
  }
  return value;
}

function normalizedType(type: string): DbfFieldType | 'unsupported' {
  switch (type.trim().toUpperCase()) {
    case 'C':
    case 'V':
    case 'Q':
      return 'C';
    case 'N':
      return 'N';
    case 'F':
      return 'F';
    case 'D':
      return 'D';
    case 'L':
      return 'L';
    // I/G/Y/B/T are read-only extensions (FoxPro integer/currency/double/
    // datetime) -- surfaced generically as numeric-ish so they're at least
    // viewable, even though the writer doesn't re-emit them as those exact
    // types.
    case 'I':
    case 'G':
    case 'Y':
    case 'B':
      return 'N';
    default:
      return 'unsupported';
  }
}

export function readDbf(bytes: Uint8Array): DbfTable {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const recordCount = view.getUint32(4, true);
  const recordDataStartOffset = view.getUint16(8, true);

  const rawFields = readFieldsInfo(bytes);
  const fields: DbfField[] = [];
  const supportedRawFields: RawFieldDescriptor[] = [];

  rawFields.forEach((f) => {
    const type = normalizedType(f.fieldType);
    if (type !== 'unsupported') {
      fields.push({ name: f.fieldName, type, length: f.fieldLength, decimals: f.fieldDecimalCount });
      supportedRawFields.push(f);
    }
  });

  const rows: DbfRow[] = [];
  let byteRead = recordDataStartOffset;
  for (let i = 0; i < recordCount; i++) {
    if (String.fromCharCode(bytes[byteRead]) === ' ') {
      byteRead += 1;
      const row: DbfRow = {};
      rawFields.forEach((col) => {
        let fieldLength = col.fieldLength;
        if (fieldLength < 0) fieldLength = 256 + fieldLength;
        if (fieldLength > 0) {
          const value = getFieldValue(
            bytes.subarray(byteRead, byteRead + fieldLength),
            col.fieldType,
            col.fieldDecimalCount,
            fieldLength,
          );
          if (normalizedType(col.fieldType) !== 'unsupported') {
            row[col.fieldName] = value as DbfRow[string];
          }
          byteRead += fieldLength;
        } else {
          throw new SyntaxError('Unsupported Dbase (.dbf) file');
        }
      });
      rows.push(row);
    } else {
      byteRead += 1;
      rawFields.forEach((col) => {
        byteRead += col.fieldLength;
      });
    }
  }

  return { fields, rows };
}
