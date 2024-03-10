#!/bin/bash

REGISTRY=257497362948.dkr.ecr.ap-south-1.amazonaws.com
REPOSITORY_NAME=frontend-builder

docker build -t frontend-builder .
docker tag frontend-builder:latest $REGISTRY/$REPOSITORY_NAME:latest
docker push $REGISTRY/$REPOSITORY_NAME:latest