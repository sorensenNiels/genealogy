FROM apache/age:release_PG18_1.8.0

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
       postgresql-18-postgis-3 \
       postgresql-18-postgis-3-scripts \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*
