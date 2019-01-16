# hotel-integration-ftp-client

## - docker run local-sftp server
```
docker pull atmoz/sftp

docker run \
-v _host/upload:/home/foo/upload \
-p 2222:22 -d atmoz/sftp \
foo:pass:1001
```