##################################################################################
FROM mongo:7-jammy AS dbbuilder

RUN apt update \
    && apt install -y \
        curl \
        python3-pip \
    && apt clean

ENV JAVA_HOME=/opt/java/openjdk
COPY --from=eclipse-temurin:25-jdk $JAVA_HOME $JAVA_HOME
ENV PATH="${JAVA_HOME}/bin:${PATH}"

COPY repos/lila/bin/mongodb/indexes.js /lila/bin/mongodb/indexes.js
COPY repos/lila-db-seed /lila-db-seed
COPY scripts/reset-db.sh /scripts/reset-db.sh
WORKDIR /lila-db-seed

RUN pip3 install -r spamdb/requirements.txt

RUN mkdir /seeded \
    && mongod --fork --logpath /var/log/mongodb/mongod.log --dbpath /seeded \
    && /scripts/reset-db.sh \
    && touch /seeded/.db_initialized

##################################################################################
FROM mongo:7-jammy

RUN apt update \
    && apt install -y debian-keyring debian-archive-keyring apt-transport-https curl \
    && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg \
    && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list \
    && apt update \
    && apt install -y \
        caddy \
        curl \
        musl \
        python3-pip \
        redis \
        supervisor \
    && apt clean \
    && pip3 install berserk pytest \
    && mkdir -p /var/log/supervisor

ENV JAVA_HOME=/opt/java/openjdk
ENV JAVA_OPTS="-Xms4g -Xmx4g"
ENV PATH="${JAVA_HOME}/bin:${PATH}"
ENV LANG=C.utf8
COPY --from=eclipse-temurin:25-jdk $JAVA_HOME $JAVA_HOME

COPY --from=dbbuilder /lila-db-seed /lila-db-seed
COPY --from=dbbuilder /scripts /scripts
COPY --from=dbbuilder /seeded /seeded
RUN pip3 install -r /lila-db-seed/spamdb/requirements.txt

# Pre-built sbt artifacts (from CI build-sbt job)
COPY artifacts/lila-ws-target /lila-ws/target
COPY artifacts/lila-fishnet-target /lila-fishnet/app/target
COPY --from=niklasf/fishnet:2.12.0 /fishnet /fishnet
COPY artifacts/lila-indexes /lila/bin/mongodb/indexes.js
COPY artifacts/lila-target /lila/target
COPY artifacts/lila-public /lila/public
COPY artifacts/lila-conf /lila/conf

# Pre-built node assets (from CI build-node job)
COPY artifacts/node-public /lila/target/universal/stage/public

COPY conf/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY conf/mono.Caddyfile /mono.Caddyfile
COPY static /static

ENV LILA_SITE_NAME=lila-quick
ENV LILA_DOMAIN=localhost:8080
ENV LILA_URL=http://localhost:8080

CMD ["supervisord", "-c", "/etc/supervisor/supervisord.conf"]
