# ============================================================
# Dockerfile de producao - Nexa frontend (SPA Vite servido por nginx)
# ============================================================
# Espera o build do Vite pre-compilado em dist/ (gerado na CI, como no TMS).
# O SPA usa baseURL '/api' (relativo) - quem roteia /api e /ws e o reverse
# proxy do HOST, no mesmo dominio. Este nginx so serve estaticos + fallback SPA.
# ============================================================

FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
