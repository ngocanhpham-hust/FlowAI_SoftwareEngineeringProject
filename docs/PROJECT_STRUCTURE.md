# Project Structure

The project is organized so runtime entrypoints stay stable while implementation code is grouped by responsibility.

## Backend

```text
backend/
├── server.js
├── src/
│   ├── app.js
│   ├── config/
│   │   ├── db.js
│   │   ├── paths.js
│   │   └── schema.sql
│   ├── middleware/
│   │   ├── errorHandler.js
│   │   └── uploadMiddleware.js
│   ├── routes/
│   │   ├── analytics.js
│   │   ├── auth.js
│   │   ├── cameras.js
│   │   ├── demo.js
│   │   ├── reports.js
│   │   ├── videos.js
│   │   └── zones.js
│   └── services/
│       ├── Auth and user services
│       ├── VideoProcessingService.js
│       └── Supporting analytics/video/zone services
├── public/
├── uploads/
└── outputs/
```

`backend/server.js` remains the stable entrypoint for `npm start`.

`backend/src/app.js` creates the Express application, registers middleware, serves the static frontend, and mounts routes.

`backend/src/routes` owns HTTP endpoint definitions.

`backend/src/services` owns reusable business and processing logic.

`backend/src/middleware` owns Express middleware such as upload handling and error handling.

`backend/src/config` owns database, path, and schema configuration.

## Frontend

```text
backend/public/
├── index.html
├── app.js
└── style.css
```

The frontend is served directly by Express and uses REST APIs exposed by the backend.

## Computer Vision

```text
ai_services/
├── extract_preview.py
├── tracking.py
├── analytics.py
├── heatmap.py
├── zones.py
└── demo_media.py
```

The backend calls these scripts through `child_process.execFile`.
