# Smart Pedestrian Flow Monitoring

Smart pedestrian flow monitoring and analytics dashboard for uploaded camera videos.

## Project Layout

```text
.
├── backend/
│   ├── server.js          # Thin application entrypoint used by npm start
│   ├── src/               # Backend source code
│   ├── public/            # Static frontend dashboard
│   ├── uploads/           # Runtime uploaded videos
│   └── outputs/           # Runtime processing metadata
├── ai_services/           # Python computer vision pipeline
├── sample_data/           # Demo videos
├── tests/                 # API smoke tests
└── docs/                  # Project documentation and diagrams
```

More detail: [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md)

## Run

```bash
npm install
python3 -m pip install -r requirements.txt
PGUSER=ngocanh PGDATABASE=flowai npm start
```

Open:

```text
http://localhost:3000
```

Default admin account:

```text
admin@flowai.local / admin123
```

## Main Runtime Stack

- Frontend: static HTML, CSS, JavaScript in `backend/public`
- Backend: Node.js and Express in `backend/src`
- Database: PostgreSQL
- Computer vision: Python scripts in `ai_services`
- Detection/tracking: YOLOv8-based processing
