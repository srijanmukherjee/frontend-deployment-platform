#!/bin/sh

# https://stackoverflow.com/a/57093657/23208283
export AWS_CONTAINER_CREDENTIALS_RELATIVE_URI

export SOURCE_PATH=/home/app/source
export BUILD_DIRECTORY=dist

git clone $GIT_REPOSITORY_URL $SOURCE_PATH

exec node build.js