FROM eclipse-temurin:21-jdk AS build

WORKDIR /app

# Copy Maven files from proxy directory
COPY proxy/pom.xml .
COPY proxy/src ./src

# Build the application
RUN apt-get update && apt-get install -y maven
RUN mvn clean package -DskipTests

FROM eclipse-temurin:21-jre

WORKDIR /app

# Copy the built jar from build stage
COPY --from=build /app/target/sentinel-proxy-1.0.0-SNAPSHOT.jar app.jar

# Expose port
EXPOSE 8080

# Run the application
ENTRYPOINT ["java", "-jar", "app.jar"]
