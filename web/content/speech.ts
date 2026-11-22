export type SignedSpeech = { text: string; issued: number; nonce: string; sig: string };

// Returning from the iterator cancels the LiveKit stream and releases its receive buffer.
export async function callerTranscript(reader: AsyncIterable<string>, own: boolean) {
  if (!own) {
    await reader[Symbol.asyncIterator]().return?.();
    return null;
  }
  let text = "";
  for await (const chunk of reader) {
    if (text.length + chunk.length > 500) return null;
    text += chunk;
  }
  return text;
}
