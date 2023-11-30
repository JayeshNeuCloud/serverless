const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { Storage } = require('@google-cloud/storage');
const AWS = require('aws-sdk');
const FormData = require('form-data');

const storage = new Storage({ keyFilename: process.env.GCP_CREDENTIALS_PATH });
const dynamodb = new AWS.DynamoDB.DocumentClient({ region: process.env.AWS_REGION });

exports.handler = async (event, context) => {
    try {
        const { repo_url, user_id, assignment_id, submission_id, user_email } = event;

        const downloadPath = `/tmp/${user_id}/${assignment_id}`;
        await downloadRelease(repo_url, downloadPath, user_email, user_id, assignment_id, submission_id);
    } catch (e) {
        console.error("Error while handling data: ", e);
    }
};

async function downloadRelease(repo_url, downloadPath, user_email, user_id, assignment_id, submission_id) {
    try {
        const response = await axios.get(repo_url, { responseType: 'arraybuffer' });
        const contentType = response.headers['content-type'];
        const contentLength = response.headers['content-length'];

        console.log(contentType, contentLength);
        if (contentLength && contentType.includes('application/zip')) {
            const filePath = path.join(downloadPath, `${submission_id}.zip`);
            fs.mkdirSync(downloadPath, { recursive: true });
            fs.writeFileSync(filePath, response.data);

            await uploadToGcs(filePath, process.env.GCS_BUCKET_NAME);
            await emailStatus(user_email, `Your file has been downloaded successfully for submission: ${submission_id}`);
        } else {
            await emailStatus(user_email, "Incorrect file format, Please upload the URL of a zip file");
        }
    } catch (e) {
        console.error("Error while Downloading data: ", e);
    }
}

async function uploadToGcs(filePath, bucketName) {
    try {
        const bucket = storage.bucket(bucketName);
        await bucket.upload(filePath);
    } catch (e) {
        console.error("Error while uploading files to GCS: ", e);
    }
}

async function emailStatus(user_email, message) {
    try {
        const mailgunApiKey = process.env.MAILGUN_API_KEY;
        const mailgunDomain = process.env.MAILGUN_DOMAIN;
        const sender = process.env.MAILGUN_SENDER;
        const mailgunApiUrl = `https://api.mailgun.net/v3/${mailgunDomain}/messages`;

        const formData = new FormData();
        formData.append('from', sender);
        formData.append('to', user_email);
        formData.append('subject', 'Download Status Notification');
        formData.append('text', `The status of your download is:\n\n ${message} \n\n Thanks,\nYour Team`);

        const response = await axios.post(mailgunApiUrl, formData, {
            auth: { username: 'api', password: mailgunApiKey },
            headers: formData.getHeaders()
        });

        if (response.status_code === 200) {
            console.log(`Email sent successfully to ${user_email}`);
        } else {
            console.log(`Failed to send email. Status code: ${response.status_code}`);
        }

        await trackEmail(process.env.DYNAMODB_TABLE, user_email, message);
    } catch (e) {
        console.error("Error while sending email: ", e);
    }
}

async function trackEmail(tableName, user_email, message) {
    try {
        const currentTime = new Date().getTime().toString();
        await dynamodb.put({
            TableName: tableName,
            Item: {
                id: currentTime,
                UserEmail: user_email,
                Timestamp: currentTime,
                Message: message
            }
        }).promise();
    } catch (e) {
        console.error("Error while tracking email: ", e);
    }
}
