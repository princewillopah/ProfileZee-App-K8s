

















FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

FROM nginx:1.27-alpine

COPY --from=builder /app/build /usr/share/nginx/html

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]










# This Dockerfile is used to build the frontend React application for the user management system.
# It compiles the React code into static files that can be served by a web server (like nginx).
# The resulting build output is placed in the /app/build directory, which can be shared with the nginx container via a volume.  

# FROM node:20-alpine
# WORKDIR /app
# COPY package.json .
# RUN npm install
# COPY . .
# ENV REACT_APP_API_URL=http://localhost:18080/api
# RUN npm run build

