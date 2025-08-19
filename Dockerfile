# 基础镜像：轻量级 Nginx（Alpine 版本体积小、速度快）
FROM nginx:alpine

# 设置环境变量确保字符编码正确
ENV LANG C.UTF-8
ENV LC_ALL C.UTF-8

# 复制项目静态文件到 Nginx 托管目录
COPY ./docs /usr/share/nginx/html

# 复制自定义 Nginx 配置（解决中文乱码、设置默认首页等）
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 暴露 80 端口（Zeabur 会自动识别并映射）
EXPOSE 80

# 启动 Nginx 服务（保持前台运行，避免容器退出）
CMD ["nginx", "-g", "daemon off;"]
