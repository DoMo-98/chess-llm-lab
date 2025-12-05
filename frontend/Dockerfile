# 1. Usamos una versión ligera de Node (Alpine)
FROM node:20-alpine

# 2. Instalamos pnpm globalmente
RUN npm install -g pnpm

# 3. Carpeta de trabajo
WORKDIR /app

# 4. Copiamos dependencias
COPY package.json pnpm-lock.yaml ./

# 5. Instalamos dependencias
RUN pnpm install

# 6. Copiamos el código
COPY . .

# 7. Exponemos el puerto
EXPOSE 4200

# 8. Arrancamos la app
# - Usamos "pnpm exec" para ejecutar el binario local de ng directamente.
CMD ["pnpm", "exec", "ng", "serve", "--host", "0.0.0.0"]