export type TorrentMetadata = {
  name: string;
  files: {
    path: string;
    length: number;
  }[];
};

const TEXT_DECODER = new TextDecoder();

type ParseResult<T> = { value: T; nextIndex: number };

const decodeString = (data: Uint8Array, index: number): ParseResult<string> => {
  let length = 0;
  while (data[index] >= 48 && data[index] <= 57) {
    length = length * 10 + (data[index] - 48);
    index += 1;
  }
  if (data[index] !== 58) {
    throw new Error("Invalid torrent string");
  }
  index += 1;
  const value = TEXT_DECODER.decode(data.subarray(index, index + length));
  return { value, nextIndex: index + length };
};

const decodeInteger = (data: Uint8Array, index: number): ParseResult<number> => {
  if (data[index] !== 105) {
    throw new Error("Invalid torrent integer");
  }
  index += 1;
  let isNegative = false;
  if (data[index] === 45) {
    isNegative = true;
    index += 1;
  }
  let value = 0;
  while (data[index] !== 101) {
    value = value * 10 + (data[index] - 48);
    index += 1;
  }
  index += 1;
  return { value: isNegative ? -value : value, nextIndex: index };
};

const decodeList = (data: Uint8Array, index: number): ParseResult<unknown[]> => {
  if (data[index] !== 108) {
    throw new Error("Invalid torrent list");
  }
  index += 1;
  const values: unknown[] = [];
  while (data[index] !== 101) {
    const { value, nextIndex } = decodeValue(data, index);
    values.push(value);
    index = nextIndex;
  }
  return { value: values, nextIndex: index + 1 };
};

const decodeDict = (data: Uint8Array, index: number): ParseResult<Record<string, unknown>> => {
  if (data[index] !== 100) {
    throw new Error("Invalid torrent dictionary");
  }
  index += 1;
  const dict: Record<string, unknown> = {};
  while (data[index] !== 101) {
    const { value: key, nextIndex } = decodeString(data, index);
    const { value, nextIndex: afterValue } = decodeValue(data, nextIndex);
    dict[key] = value;
    index = afterValue;
  }
  return { value: dict, nextIndex: index + 1 };
};

const decodeValue = (
  data: Uint8Array,
  index: number
): ParseResult<string | number | unknown[] | Record<string, unknown>> => {
  const byte = data[index];
  if (byte === 100) {
    return decodeDict(data, index);
  }
  if (byte === 108) {
    return decodeList(data, index);
  }
  if (byte === 105) {
    return decodeInteger(data, index);
  }
  if (byte >= 48 && byte <= 57) {
    return decodeString(data, index);
  }
  throw new Error("Unsupported torrent token");
};

export async function parseTorrentFile(file: File): Promise<TorrentMetadata> {
  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);
  const { value } = decodeDict(data, 0);
  const info = value.info as Record<string, unknown> | undefined;
  if (!info) {
    throw new Error("Torrent metadata is missing info dictionary");
  }
  const nameValue = info.name ?? "Unknown";
  const name = typeof nameValue === "string" ? nameValue : JSON.stringify(nameValue);
  const filesList = Array.isArray(info.files) ? info.files : null;
  const files =
    filesList?.map((fileEntry) => {
      const entry = fileEntry as Record<string, unknown>;
      const pathValue = entry.path as string[] | undefined;
      const lengthValue = typeof entry.length === "number" ? entry.length : 0;
      const path = pathValue?.filter(Boolean).join("/") ?? name;
      return { path, length: lengthValue };
    }) ?? [{ path: name, length: typeof info.length === "number" ? info.length : 0 }];
  return { name, files };
}
