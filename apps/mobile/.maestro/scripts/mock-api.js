// Calls a control endpoint of the mock API (scripts/mock-api.mjs) from a flow:
// failures on demand. Maestro runs it on the machine that runs the flows,
// where the mock API listens; a call that does not succeed fails the flow.
//
//   - runScript:
//       file: ../scripts/mock-api.js
//       env:
//         CONTROL: faults                # faults, faults/clear, sessions/expire, sessions/revoke
//         ROUTE: POST /api/auth/sign-in  # faults only: the route, and the status it
//         STATUS: '429'                  # answers with (0: no answer at all)
//
// The mock API on another address: maestro test -e MOCK_API_URL=http://localhost:<port> .maestro

const base = typeof MOCK_API_URL === 'undefined' ? 'http://localhost:4010' : MOCK_API_URL;
const fault = typeof ROUTE === 'undefined' ? {} : { route: ROUTE, status: Number(STATUS) };

const response = http.post(base + '/__mock/' + CONTROL, {
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(fault),
});
if (!(response.status >= 200 && response.status < 300)) {
  throw new Error('Mock API ' + CONTROL + ': HTTP ' + response.status + ' ' + response.body);
}
