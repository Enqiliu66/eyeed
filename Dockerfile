# 使用更稳定的 nginx 版本
FROM nginx:1.25-alpine

# 设置时区和字符编码
ENV TZ=Asia/Shanghai \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

# 创建静态文件目录（Zeabur 要求）
RUN mkdir -p /app/static

# 复制静态文件（直接放到 Nginx 根目录）
COPY . /usr/share/nginx/html

# 修复权限（仅需保证可读）
RUN chmod -R a+r /usr/share/nginx/html

# 复制 Nginx 配置（修复端口）
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 暴露 Zeabur 要求的端口（必须）
EXPOSE 8080

# 健康检查（必须）
HEALTHCHECK --interval=30s --timeout=3s \
  CMD curl -f http://localhost:8080/ || exit 1

# 启动命令（使用 8080 端口）
CMD ["nginx", "-g", "daemon off;", "-c", "/etc/nginx/nginx.conf"]
