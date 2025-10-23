# Mock API Service - API Documentation

## Overview
This mock API simulates real-world API behaviors for testing client resilience, error handling, and observability. It includes outages, circuit breaker, rate limiting, slow responses, and random errors.

---

## Endpoints

### `GET /` or `/health`
- Returns service health, metrics, and current state.

### `GET /?name=YourName`
- Returns a hello message.

### `POST /`
- Accepts JSON body. If `{ "name": "YourName" }` is present, returns a hello message.
- Otherwise, returns a generic success response.

### `POST /hello`
- Requires `{ "name": "YourName" }` in the body. Returns a hello message.
- Returns 400 if `name` is missing.

### `POST /reset-circuit-breaker`
- Manually resets the circuit breaker to CLOSED state.

---

## Error Simulation
- **Outages:** 503 with `retry_after` and `outage_end_time`.
- **Circuit Breaker:** 503 with `circuit_breaker_state` and `recovery_time_remaining`.
- **Rate Limiting:** 429 with `retry_after`.
- **Network Failure:** 504 with clear message.
- **Random Errors:** 400, 408, 500, 503, 504 based on config.

---

## Response Fields
- `status`: success or error
- `message`: human-readable message
- `timestamp`: ISO string
- `requestId`: unique per request
- `error_type`: error category (if error)
- `retry_after`: seconds to wait (if applicable)
- `circuit_breaker_state`, `recovery_time_remaining`: for circuit breaker errors
- `outage_end_time`: for outages
- `artificial_delay_ms`: simulated delay
- `in_normal_period`: true/false

---

## Rate Limiting
- Max 50 requests per 10 seconds per IP (429 Too Many Requests)

---

## Logging
- All requests and errors are logged as structured JSON for easy parsing.

---

## Example Error Response
```json
{
  "status": "error",
  "message": "Too many requests",
  "timestamp": "2025-10-23T12:00:00.000Z",
  "requestId": "req_1234567890_abc",
  "error_type": "rate_limit",
  "retry_after": 10
}
```

---

## Notes
- All error and state transitions are logged.
- Service is designed for resilience and client-side error handling testing.
- For more details, see the source code.
