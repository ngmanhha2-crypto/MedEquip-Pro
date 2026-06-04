# Security Specification: Medical Devices Dashboard

This specification document details the core data invariants, security boundaries, and potential malicious payloads designed to test the robustness of the Firestore security rules.

## Data Invariants

1. **User Ownership (Identity Isolation)**:
   - A `Device` can only be viewed, created, updated, or deleted by the user who owns it (`userId == request.auth.uid`).
   - An `ActivityLog` can only be viewed, created, or deleted by the user who owns it (`userId == request.auth.uid`).

2. **Temporal Integrity (Strict Timestamps)**:
   - String dates must be realistic, and device ID names must meet format restrictions `^[a-zA-Z0-9_\-]+$`.

3. **Size Constraints**:
   - Device name, model, serialNumber, manufacturer, and origin strings must not exceed safety boundaries (e.g., 256 characters) to prevent "Denial of Wallet" resource consumption.

## The "Dirty Dozen" Payloads

Here are twelve specific JSON payloads attempting to violate security boundaries, check state configurations, or inject illegitimate data:

### 1. Identity Spoofing (Create Device for another User)
```json
{
  "id": "malicious_device_1",
  "userId": "victim_user_id_xyz",
  "name": "Stolen Device",
  "model": "Somatom Go",
  "serialNumber": "SN-CT-MINE",
  "manufacturer": "Siemens",
  "origin": "Đức",
  "yearOfProduction": 2025
}
```

### 2. Identity Hijacking (Update existing Device owned by another User)
```json
{
  "name": "Hijacked Device Name",
  "userId": "another_user_id"
}
```

### 3. Resource Poisoning (Device ID with massive junk string size)
```json
{
  "id": "very_long_junk_id_xxxxxxxxxxxx...[1.5KB]...",
  "userId": "attacker_user_id",
  "name": "Poison ID Device",
  "model": "Somatom Go",
  "serialNumber": "SN-CT-MINE"
}
```

### 4. Privilege Escalation (Overriding userId/admin properties)
```json
{
  "isAdmin": true,
  "role": "admin"
}
```

### 5. Type Poisoning / Schema Bypass (Setting integer field to string)
```json
{
  "id": "device_type_poison",
  "userId": "attacker_user_id",
  "name": "Poisoned Device",
  "model": "Somatom Go",
  "serialNumber": "SN-CT-MINE",
  "yearOfProduction": "two_thousand_and_twenty_five"
}
```

### 6. Empty / Invalid ID Payload
```json
{
  "id": "",
  "userId": "attacker_user_id",
  "name": "Empty ID Device",
  "model": "Somatom Go"
}
```

### 7. Unauthorized Read of other User's Devices
An unauthenticated or unauthorized user requests a batch query without matching `userId`.

### 8. Malformed Timestamp Attempt
Client payload attempts to save a far future or malformed format on critical dates or timestamps.

### 9. Logging Spoof / Rogue Event Injection (Rogue Activity Log for another Device)
```json
{
  "id": "rogue_log_1",
  "userId": "attacker_user_id",
  "deviceId": "victim_device_id_999",
  "date": "2026-06-04",
  "user": "Vandal User",
  "type": "DELETE",
  "categoryLabel": "Bảo trì",
  "description": "Malicious logs showing illegal clearance."
}
```

### 10. Floating-point or Negative Boundaries for Year
```json
{
  "id": "device_neg_year",
  "userId": "attacker_user_id",
  "name": "Faulty Year Device",
  "model": "Somatom Go",
  "serialNumber": "SN-CT-MINE",
  "yearOfProduction": -500
}
```

### 11. Excess Field Pollution (Ghost Field Attempt)
```json
{
  "id": "device_ghost",
  "userId": "attacker_user_id",
  "name": "Ghost Field Device",
  "model": "Somatom Go",
  "serialNumber": "SN-CT-MINE",
  "ghost_field_is_verified": true
}
```

### 12. List Query Trust Bypass (Collection listing query without userId filter)
Read request attempt on `/devices` collection broad matching without strict equal user verification.

---

## The Test Suite Spec

A client querying/writing to Firestore must always authenticate first, use secure document rules, and handle error cases matching the Firebase Integration Specification.
