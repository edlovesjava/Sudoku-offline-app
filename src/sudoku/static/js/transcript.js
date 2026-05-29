export const MAX_TRANSCRIPT_EVENTS = 1000;

export function truncateTranscript(transcript) {
  const list = Array.isArray(transcript) ? transcript.slice() : [];
  if (list.length <= MAX_TRANSCRIPT_EVENTS) {
    return { transcript: list, truncated: false };
  }

  return {
    transcript: list.slice(list.length - MAX_TRANSCRIPT_EVENTS),
    truncated: true,
  };
}

export function createTranscript(transcript = []) {
  return truncateTranscript(transcript).transcript;
}

export function appendTranscriptEvent(transcript, event) {
  return truncateTranscript([...(Array.isArray(transcript) ? transcript : []), event]);
}

export function serializeTranscript(transcript) {
  return JSON.stringify(createTranscript(transcript));
}
