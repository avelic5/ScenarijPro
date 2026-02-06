# ScenarijPro 🎬

**ScenarijPro** is a professional web app for collaborative real‑time writing of film and TV screenplays. It supports multi‑user editing with a robust locking system, change tracking via deltas, and versioning through checkpoints.



---

##  Table of Contents

- [Key features](#-key-features)
- [Screenplay terminology](#screenplay-terminology)
- [Technologies](#️-technologies)
- [API documentation](#-api-documentation)
- [Testing](#testing)
- [Author](#author)

---

## ✨ Key features

###  Authentication and users
- User registration and login
- Profile management
- Sessions based on user IDs

###  Scenario management
- **Create scenarios** — New scenario with a customizable title
- **CRUD operations** — Full scenario lifecycle management
- **Line structure** — Lines linked via `nextLineId` to keep ordering
- **Automatic wrapping** — Text longer than 20 words wraps into multiple lines

###  Collaborative editing with locking
- **Line locking** — Users lock a line before editing to avoid conflicts
- **Global locking** — Each user can lock only one line across all scenarios
- **Character locking** — Lock a character name while renaming across a scenario
- **Auto‑unlock** — Line unlocks after a successful update

###  Delta tracking and versioning
- **Delta tracking** — Each change recorded with a Unix timestamp
- **Change types**: `line_update` and `char_rename`
- **Checkpoint system** — Snapshots of scenario state
- **Restore** — Rebuild the scenario at any checkpoint

###  Editor and stats
- **Rich text editor** — Bold, italic, and underline support
- **Word count** — Total, bold, and italic counts
- **Role analysis** — Detect roles, replies, and dialogue
- **Error detection** — Detect likely misspelled role names

---

## Screenplay terminology

| Term | Definition |
|------|------------|
| **Word** | Text unit split by spaces; hyphen/apostrophe inside a word count as part of the word |
| **Line** | Text up to a newline or end of text |
| **Role** | Character name in ALL CAPS with a speech line below it |
| **Reply** | A block of speech belonging to one role |
| **Dialogue** | Alternating sequence of replies from different roles |
| **Scene** | Text between scene headings (INT./EXT.) |
| **Scene heading** | Line starting with “INT.” or “EXT.” and containing time of day |
| **Action segment** | Narration, action descriptions, or technical notes |

---

## 🛠️ Technologies

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 18+ | Runtime environment |
| Express.js | 5.x | Web framework |
| Sequelize | 6.x | ORM for database |
| PostgreSQL | 15+ | Relational database |

### Frontend
| Technology | Purpose |
|------------|---------|
| Vanilla JavaScript | Maximum control without frameworks |
| HTML5 | Semantic structure |
| CSS3 | Modern styling with Poppins font |

### Testing
| Tool | Purpose |
|------|---------|
| Jest | Test framework |
| Supertest | HTTP endpoint testing |
| Chai | Assertion library |

---

## 📡 API documentation

### Authentication

| Method | Endpoint | Description | Request body |
|--------|----------|------|-----------------|
| `POST` | `/api/auth/register` | Register user | `{firstName, lastName, email, password}` |
| `POST` | `/api/auth/login` | Login user | `{email, password}` |
| `GET` | `/api/auth/user/:userId` | Fetch user | - |
| `PUT` | `/api/auth/user/:userId` | Update user | `{firstName, lastName, email}` |
| `DELETE` | `/api/auth/user/:userId` | Delete user | - |

### Scenarios

| Method | Endpoint | Description | Request body |
|--------|----------|------|-----------------|
| `POST` | `/api/scenarios` | Create scenario | `{title}` |
| `GET` | `/api/scenarios` | List all scenarios | - |
| `GET` | `/api/scenarios/:id` | Fetch scenario with lines | - |
| `DELETE` | `/api/scenarios/:id` | Delete scenario | - |

**Example response for GET `/api/scenarios/:id`:**
```json
{
  "id": 1,
   "title": "The Search for the Lost Key",
  "content": [
   { "lineId": 1, "nextLineId": 2, "text": "NARRATOR" },
   { "lineId": 2, "nextLineId": 3, "text": "The sun was slowly setting over the old town." }
  ]
}
```

### Lines and locking

| Method | Endpoint | Description | Request body |
|--------|----------|------|-----------------|
| `POST` | `/api/scenarios/:id/lines/:lineId/lock` | Lock a line | `{userId}` |
| `PUT` | `/api/scenarios/:id/lines/:lineId` | Update line (auto-wrap >20 words) | `{userId, newText: [...]}` |
| `DELETE` | `/api/scenarios/:id/lines/:lineId` | Delete line | `{userId}` |
| `POST` | `/api/locks/release` | Release lock | `{userId, scenarioId, lineId}` |

### Characters

| Method | Endpoint | Description | Request body |
|--------|----------|------|-----------------|
| `POST` | `/api/scenarios/:id/characters/lock` | Lock character name | `{userId, characterName}` |
| `POST` | `/api/scenarios/:id/characters/update` | Rename character | `{userId, oldName, newName}` |

### Deltas and checkpoints

| Method | Endpoint | Description |
|--------|----------|------|
| `GET` | `/api/scenarios/:id/deltas?since={timestamp}` | Changes after timestamp |
| `POST` | `/api/scenarios/:id/checkpoint` | Create checkpoint |
| `GET` | `/api/scenarios/:id/checkpoints` | List checkpoints |
| `GET` | `/api/scenarios/:id/restore/:checkpointId` | Restore state at checkpoint |

---

##  Testing

```bash
# Run all tests
npm test

# Run a specific test
npm run test:deltas

# Tests with verbose output
npm test -- --verbose
```

### Test coverage
- Scenario creation
- Line locking
- Line updates (with wrapping)
- Line deletion
- Character locking and rename
- Delta tracking
- Checkpoint creation and restore

---

##  Author

**Aldin Velić**


