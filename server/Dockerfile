# 康复训练后端：零依赖，镜像很小
FROM node:20-alpine
WORKDIR /app
COPY index.js store.js ./
RUN mkdir -p /app/data /app/static
ENV PORT=8787 DATA_DIR=/app/data STATIC_DIR=/app/static
EXPOSE 8787
# 用非 root 运行
USER node
CMD ["node", "index.js"]
