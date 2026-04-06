---
description: Refresh the spacetime db front and back stacks
---

cd C:\Users\asnea\Documents\Github\Ml_Web_App\server\domino-vision
spacetime build
spacetime generate --lang typescript --out-dir js/stdb --module-path ..\..\server\domino-vision\spacetimedb\
npm run build-stdb
spacetime publish domino-vision --server local --clear-database -y