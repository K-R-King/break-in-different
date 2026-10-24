# Practice interview

A spoken practice interview for one job. Claude plays the interviewer, Cartesia gives it a voice, and the candidate answers by voice or by typing. Route: `/jobs/:id/practice`, opened from "Practice an interview" on the Jobs detail panel.

## How a turn works

1. The candidate holds "Hold to answer" (pointer, or Space/Enter) and speaks. `stt.transcribe` (Cartesia `ink-whisper`) turns it into text. They can also type, and Ctrl+Enter sends.
2. The browser sends `ai/practice:turn` the job ID, the style and the conversation so far.
3. Claude (`CLAUDE_MODEL_EXTRACT`, chosen for speed) writes the interviewer's next line: a new question, one follow-up, or a closing line.
4. The server checks the line (`practiceLineIsValid`), speaks it with Cartesia (`cartesiaSse`, word timestamps), and returns the text and a short-lived audio URL together.
5. The page plays the audio and highlights each word. "Get feedback" calls `ai/practice:feedback`, which comments on content only.

Measured on the local stack with real keys: about 2.4–3.9 s per turn and about 7.5 s for feedback.

## Rules it follows

- **No timer.** The interviewer waits until an answer is sent. "I need a moment" stops the audio, and nothing moves on by itself.
- **Candidate controls:** Repeat, Say it differently, Play on any line, Esc to stop, Start over.
- **Two styles:** a spoken conversation, or written questions. Written questions are the default when the profile requires written alternatives.
- **Listen-only option:** a spoken conversation can hide the text ("Show the conversation as text", on by default) to feel like a real interview. Turning it back on shows everything said so far.
- **About 4 questions,** with at most one follow-up each. The server forces a close after 9 interviewer turns.
- **Feedback covers content only:** whether the answer addressed the question, its structure, examples and relevance. Never tone, pace, pauses, filler words, accent or confidence.
- **The interviewer never asks about health, disability or other personal characteristics.** Lines containing condition words are rejected.

## Privacy

- **Nothing goes in the database.** The conversation lives in the page and is gone on reload. No schema change.
- **Answers reach Claude** with condition words (the `HEALTH_TERMS` list plus the condition labels) replaced by `[removed]`. `convex/ai/privacy.test.ts` checks this.
- **Profile data:** disability selections and the profile are never read, and the action does not touch `sensitiveProfiles`.
- **Interviewer audio** is put in file storage so the browser can play it, then deleted after 30 minutes by `ai/practice:forgetAudio`.
- **Only server-written text is ever spoken.** There is no endpoint that speaks text sent from the browser.
- **The page shows a notice** about all of the above before practice starts.

## Fallbacks

| Failure                                        | What happens                                                                                                                                                                                                                                   |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No Claude key, `MOCK_AI=1`, or an invalid line | Scripted interviewer: 4 fixed questions built from the job title and its first listed skill, plus a notice on that turn ("This question is from our standard practice set…"). The reason class is logged as `practice: SCRIPTED_TURN <reason>` |
| No Cartesia key or Cartesia fails              | The browser's own voice, with word highlighting                                                                                                                                                                                                |
| Speech-to-text unavailable or mic blocked      | A message, and the candidate types instead                                                                                                                                                                                                     |
| Feedback unavailable                           | A short content checklist instead of AI feedback                                                                                                                                                                                               |

## Files

- `convex/ai/practice.ts`: `turn`, `feedback` and `forgetAudio`
- `convex/ai/prompts.ts`: `interviewerTurn` and `practiceFeedback`
- `convex/ai/validators.ts`: `redactHealthTerms` and `practiceLineIsValid`
- `convex/ai/templates.ts`: `scriptedPracticeTurn`
- `src/routes/PracticePage.tsx`, with strings in `src/copy.ts` under `practice`
- Tests: `convex/ai/validators.test.ts`, `convex/ai/privacy.test.ts`, `tests/e2e/practice.spec.ts`, and `tests/a11y/routes.spec.ts` (both page states in all three modes)

## Not built

- Video. It's left out on purpose: judging faces or eye contact would penalize the users this is for, and it would send their image to a third party.
- Saved practice history, and a link from Tracker interview dates.
- A separate interviewer voice. It uses `CARTESIA_VOICE_ID` like read-aloud.
- Streaming audio while it is still being generated.
