# Acta Digital GE — imagen única: Express sirve web/ estático + API contra Postgres.
FROM node:20-alpine

WORKDIR /app

# deps primero (cache de capas) — solo express + pg, sin builds nativos
COPY apps/actas/package.json apps/actas/
RUN cd apps/actas && npm install --omit=dev --no-audit --no-fund

# código + frontend (los mp4 de web/publicidad quedan fuera por .dockerignore —
# se sirven vía /api/media proxy a Supabase)
COPY apps/actas apps/actas
COPY web web

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "apps/actas/server.js"]
