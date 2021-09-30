const assert = require('assert');
const { S3 } = require('aws-sdk');

const checkError = require('../../lib/utility/checkError');
const getConfig = require('../support/config');
const BucketUtility = require('../../lib/utility/bucket-util');

const bucket = 'mock-notification-bucket';

function getNotificationParams(events, arn, id, filter) {
    const notifConfig = {
        QueueConfigurations: [
            {
                Events: events || ['s3:ObjectCreated:*'],
                QueueArn: arn || 'arn:scality:bucketnotif:::target1',
            },
        ],
    };
    if (id) {
        notifConfig.QueueConfigurations[0].Id = id;
    }
    if (filter) {
        notifConfig.QueueConfigurations[0].Filter = filter;
    }
    return {
        Bucket: bucket,
        NotificationConfiguration: notifConfig,
    };
}

describe('aws-sdk test put notification configuration', () => {
    let s3;
    let otherAccountS3;

    before(() => {
        const config = getConfig('default', { signatureVersion: 'v4' });
        s3 = new S3(config);
        otherAccountS3 = new BucketUtility('lisa', {}).s3;
    });

    it('should return NoSuchBucket error if bucket does not exist', done => {
        const params = getNotificationParams();
        s3.putBucketNotificationConfiguration(params, err => {
            checkError(err, 'NoSuchBucket', 404);
            done();
        });
    });

    describe('config rules', () => {
        beforeEach(done => s3.createBucket({
            Bucket: bucket,
        }, done));

        afterEach(done => s3.deleteBucket({ Bucket: bucket }, done));

        it('should return AccessDenied if user is not bucket owner', done => {
            const params = getNotificationParams();
            otherAccountS3.putBucketNotificationConfiguration(params, err => {
                checkError(err, 'AccessDenied', 403);
                done();
            });
        });

        it('should put notification configuration on bucket with basic config',
            done => {
                const params = getNotificationParams();
                s3.putBucketNotificationConfiguration(params, done);
            });

        it('should put notification configuration on bucket with multiple events',
            done => {
                const params = getNotificationParams(
                    ['s3:ObjectCreated:*', 's3:ObjectRemoved:*']);
                s3.putBucketNotificationConfiguration(params, done);
            });

        it('should put notification configuration on bucket with id',
            done => {
                const params = getNotificationParams(null, null, 'notification-id');
                s3.putBucketNotificationConfiguration(params, done);
            });

        it('should put empty notification configuration', done => {
            const params = {
                Bucket: bucket,
                NotificationConfiguration: {},
            };
            s3.putBucketNotificationConfiguration(params, done);
        });

        it('should not allow notification config request with invalid arn',
            done => {
                const params = getNotificationParams(null, 'invalidArn');
                s3.putBucketNotificationConfiguration(params, err => {
                    checkError(err, 'MalformedXML', 400);
                    done();
                });
            });

        it('should not allow notification config request with invalid event',
            done => {
                const params = getNotificationParams(['s3:NotAnEvent']);
                s3.putBucketNotificationConfiguration(params, err => {
                    checkError(err, 'MalformedXML', 400);
                    done();
                });
            });

        it('should not allow notification config request with unsupported destination',
            done => {
                const params = getNotificationParams(null, 'arn:scality:bucketnotif:::target100');
                s3.putBucketNotificationConfiguration(params, err => {
                    checkError(err, 'InvalidArgument', 400);
                    done();
                });
            });
    });

    describe('cross origin requests', () => {
        beforeEach(done => s3.createBucket({
            Bucket: bucket,
        }, done));

        afterEach(done => s3.deleteBucket({ Bucket: bucket }, done));

        const corsTests = [
            {
                it: 'return valid error with invalid arn',
                param: getNotificationParams(null, 'invalidArn'),
                error: 'MalformedXML',
            }, {
                it: 'return valid error with unknown/unsupported destination',
                param: getNotificationParams(null, 'arn:scality:bucketnotif:::target100'),
                error: 'InvalidArgument',
            }, {
                it: 'save notification configuration with correct arn',
                param: getNotificationParams(),
            },
        ];

        corsTests.forEach(test => {
            it(`should ${test.it}`, done => {
                const req = s3.putBucketNotificationConfiguration(test.param);
                req.httpRequest.headers.origin = 'http://localhost:3000';
                req.send(err => {
                    if (test.error) {
                        checkError(err, test.error, 400);
                    } else {
                        assert.ifError(err);
                    }
                    done();
                });
            });
        });
    });
});
