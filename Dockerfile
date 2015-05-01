
FROM iodigital/ubuntu-node:v1

MAINTAINER Ant Cosentino <ant@io.co.za>

ENV NODE_PORT 8080

MAINTAINER Ant Cosentino <ant@io.co.za>

ENV NODE_STATUS_JSON http://data.goddard.com/status.json
ENV NODE_NODE_JSON http://data.goddard.com/node.json
ENV NODE_BUILD_JSON http://data.goddard.com/build.json
ENV NODE_APPS_JSON http://data.goddard.com/apps.json
ENV NODE_ENV production