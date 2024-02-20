
# Serverless Readme
This Node.js application is designed to handle the download of submission releases and send corresponding email notifications. It is built to work with AWS Lambda, and it utilizes various cloud services such as Google Cloud Storage (GCS) and Mailgun.

Prerequisites
Before deploying and using this service, make sure you have the following prerequisites:

Node.js and npm installed
AWS Lambda environment set up
Google Cloud Storage bucket created
Mailgun account and API key
DynamoDB table for tracking email status
Setup
Install dependencies:
   npm install
Configure environment variables:

Create a .env file and set the following variables:

env

MAIL_GUN_API_KEY=your_mailgun_api_key
GCP_PRIVATE_KEY=your_base64_encoded_gcp_private_key
GCS_BUCKET_NAME=your_gcs_bucket_name
Deploy the AWS Lambda function

AWS Lambda Function The main logic is implemented in the handler function within the index.js file. This function is triggered by an SNS (Simple Notification Service) event and performs the following actions:

Downloads the submission release from a provided URL.
Uploads the release to Google Cloud Storage.
Generates a signed URL for the uploaded object.
Sends a success email with download details.
Tracks the email status in DynamoDB.
If any step fails, the service sends a failure email and tracks the error in DynamoDB.
Google Cloud Storage The uploadToGCS function handles the upload of submission releases to Google Cloud Storage. It uses the @google-cloud/storage library to interact with GCS.

Mailgun The sendSuccessEmail and sendFailureEmail functions use the Mailgun API to send success and failure email notifications, respectively.

DynamoDB The trackEmail function records email status in a DynamoDB table named Csye6225_Demo_DynamoDB. The table stores information such as the email timestamp, recipient email address, and status.

Additional Notes Make sure to secure sensitive information like API keys and private keys. Adjust the error handling and logging based on your requirements. Test the Lambda function thoroughly before deploying it to a production environment. Feel free to customize this code to fit your specific use case and requirements.


# serverless  Code Debugging
'use strict';
const { Storage } = require('@google-cloud/storage');
const axios = require('axios');
const { Buffer } = require('buffer');
const AWS = require('aws-sdk');
const mailgun = require("mailgun-js");
const { Console } = require('console');
const dynamoDb = new AWS.DynamoDB.DocumentClient();

// Decode the base64-encoded service account key
const decodedKey = Buffer.from(process.env.GCP_SECRET_KEY, 'base64').toString('utf-8');
const serviceAccountKey = JSON.parse(decodedKey);

// Create a Google Cloud Storage client with the service account key
const storage = new Storage({
  credentials: {
    project_id: process.env.PROJECT_ID,
    private_key: serviceAccountKey.private_key,
    client_email: serviceAccountKey.client_email,
  },
});

AWS.config.update({
  accessKeyId: process.env.accessKeyId,
  secretAccessKey: process.env.secretAccessKey,
  region: process.env.AWS_REGIONE,
});


const mg = mailgun({
  apiKey: process.env.MAILGUN_API_KEY,
  domain: process.env.MAILGUN_DOMAIN,
});

module.exports.handler = async (event) => {
  console.log(event.Records[0].Sns.Message);
  const snsMessage = JSON.parse(event.Records[0].Sns.Message);
  const { url, userEmail, assignmentId, submissionCount } = snsMessage; // Can get User Id as well

  //const [entriescount, allowed_attempts, deadline, email, url]

  console.log(url, userEmail, assignmentId, submissionCount);
  console.log(event);

  console.log('Received event:', JSON.stringify(event, null, 2));
  console.log('Google key', storage);

  const email = userEmail;

  console.log(process.env.GCS_BUCKET_NAME);
  console.log(process.env.MAILGUN_API_KEY);
  console.log(process.env.MAILGUN_DOMAIN);
  console.log(process.env.MAILGUN_SENDER);
  console.log(process.env.DYNAMODB_TABLE);
  console.log(process.env.AWS_REGIONE);
  console.log(process.env.GCP_SECRET_KEY);
  console.log(process.env.PROJECT_ID);
  console.log(process.env.accessKeyId);
  console.log(process.env.secretAccessKey);


  // Assuming 'event' is your JSON object
  const message = event.Records[0].Sns.Message;
  console.log('Message:', message);
  console.log("Before try block");


  try {
    
    const fileName = `${email}${Date.now()}.zip`;
    const bucketName = process.env.GCS_BUCKET_NAME;
    const bucket = storage.bucket(bucketName);
    console.log(bucketName);
    console.log(bucket);
    console.log(fileName);

    console.log("Before download file in try block above url");
    // Download the file from the URL
    // const url = "https://github.com/tparikh/myrepo/archive/refs/tags/v1.0.0.zip";
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const fileContent = Buffer.from(response.data);
    console.log("Before download file in try after url");
    console.log(fileContent);

    
    const file = bucket.file(fileName);
    console.log("before await function");
    
    await storage.bucket(bucketName).file(fileName).save(fileContent);
    console.log("after await function");

    // ------------test mail gun------------------

    async function sendEmail(mg) {

      const emailContent = `
      Dear User,

      We like to inform you that the URL you provided is valid and processed.
      we reviewed the link and it is accurate. We were able to store your work and the attempt will be counted for submissions.
      If you attempt and deadline remaining kindly try to submit again , other wise latest submission will be taken into account.
      You cannot submmit if deadline and attempt is exceded.

      Details:
      - Attempts: ${submissionCount}
      - Deadline for submission: 2024-08-29T09:12:33.001Z
      - File from URL saved in Google Cloud Storage: ${process.env.GCS_BUCKET_NAME}/${fileName}
     
      If you have any questions or concerns, please contact your professor or TA.

      Sincerely,
      Submission Team
    `;


 
      const data = {
        from: "Jayesh <mailgun@demo.jayeshtak.me>",
        to: [email],
        subject: "Hello",
        text: emailContent,
      };

      try {
        const body = await mg.messages().send(data);
        console.log("Email sent successfully:", body);
      } catch (error) {
        console.error("Error sending email:", error);
      }
    }

    // const mg = mailgun({
    //   apiKey: "4f8b7fc53498e8213514721877ec92ab-0a688b4a-f9ad4ace",
    //   domain: "demo.jayeshtak.me",
    // });

    await sendEmail(mg);
    console.log("after mail gun");

    //--------Dynamic table name-----------------
    // var timestamp = Date.now();
    var timestamp = new Date().toISOString();
    // Log to DynamoDB
    const dynamoParams = {
      TableName: process.env.DYNAMODB_TABLE, // Use the DynamoDB table name from environment variables
      Item: {
        EmailId: email,
        Timestamp: timestamp,
        Status: "Success"
        // Add additional attributes as needed
      },
    };
    // Wrap DynamoDB operation in try-catch
    try {
      await dynamoDb.put(dynamoParams).promise();
      console.log('Item added to DynamoDB successfully');
    } catch (dynamoError) {
      console.error('Error adding item to DynamoDB:', dynamoError);
      // Handle DynamoDB error as needed
    }


    // -------------test end----------------------

  }
  catch (error) {
    try {

      console.log(error + "Inside failure mail try block");
      
      async function sendfEmail(mg) {

        const emailContent = `
        Dear User,

        We regret to inform you that the URL you provided is invalid and cannot be processed.
        Please review the link and ensure it is accurate. We were unable to store your work. But the attempt will be counted for submissions.
        If you attempt and deadline remaining kindly try to submit again , other wise latest submission will be taken into account.
        You cannot submmit if deadline and attempt is exceded.

        Details:
        - Attempts: ${submissionCount}
        - Deadline for submission: 2024-08-29T09:12:33.001Z
        
        If you have any questions or concerns, please contact your professor or TA.

        Sincerely,
        Submission Team
      `;

        const data = {
          from: "Jayesh <mailgun@demo.jayeshtak.me>",
          to: [email],
          subject: "Hello",
          text: emailContent,
        };

        try {
          const body = await mg.messages().send(data);
          console.log("Failure......Email sent successfully:", body);
        } catch (error) {
          console.error("Failure......Error sending email:", error);
        }
      }

      // const mgf = mailgun({
      //   apiKey: "4f8b7fc53498e8213514721877ec92ab-0a688b4a-f9ad4ace",
      //   domain: "demo.jayeshtak.me",
      // });

      // var timestamp = Date.now();
      var timestamp = new Date().toISOString();
      // Log to DynamoDB
      const dynamoParams = {
        TableName: process.env.DYNAMODB_TABLE, // Use the DynamoDB table name from environment variables
        Item: {
          EmailId: "tak.j@northeastern.edu",  //This was not reading in try block
          Timestamp: timestamp,
          Status: "Failed"
          // Add additional attributes as needed
        },
      };


      await sendfEmail(mg);
      console.log("Failure......after mail gun");


      //--------Dynamic table name-----------------

      // Wrap DynamoDB operation in try-catch
      try {
        await dynamoDb.put(dynamoParams).promise();
        console.log('Item added to DynamoDB successfully');
      } catch (dynamoError) {
        console.error('Error adding item to DynamoDB:', dynamoError);
        // Handle DynamoDB error as needed
      }

    } catch (error) {
      
      console.log(error);
      console.log('Email not sent due to an Failure SES error');
    }
    //console.error('Error downloading and saving the file:', error.message);
  }

  return {
    statusCode: 200,
    body: JSON.stringify(
      {
        message: 'Go Serverless v1.0! Your function executed successfully!',
        input: event,
      },
      null,
      2
    ),
  };
};



