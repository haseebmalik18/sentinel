FROM eclipse-temurin:21-jdk-alpine AS build

WORKDIR /workspace/app

# Copy Maven files
COPY pom.xml .
COPY src src

# Build the application
RUN apk add --no-cache maven && \
    mvn clean package -DskipTests && \
    mkdir -p target/dependency && \
    cd target/dependency && \
    jar -xf ../*.jar

FROM eclipse-temurin:21-jre-alpine

# Add non-root user
RUN addgroup -S sentinel && adduser -S sentinel -G sentinel
USER sentinel:sentinel

WORKDIR /app

# Copy application from build stage
ARG DEPENDENCY=/workspace/app/target/dependency
COPY --from=build ${DEPENDENCY}/BOOT-INF/lib /app/lib
COPY --from=build ${DEPENDENCY}/META-INF /app/META-INF
COPY --from=build ${DEPENDENCY}/BOOT-INF/classes /app

# Expose port
EXPOSE 8080

# Run the application
ENTRYPOINT ["java", "-cp", "app:app/lib/*", "com.sentinel.SentinelApplication"]
