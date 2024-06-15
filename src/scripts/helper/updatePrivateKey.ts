import fs from 'fs';
import { PrivateKey, PublicKey } from 'o1js';

interface key {
    privateKey: string;
    publicKey: string;
}

// Define the data for each file
let filesData: key[] = [];

// Define the file names as an array
const fileNames = [
    'project.json',
    'campaign.json',
    'nullifier.json',
    'funding.json',
    'funding_requester.json',
    'vesting.json',
    'vesting_requester.json',
    'participation.json',
    'treasury_manager.json',
];

function createFileData() {
    let tempFilesData: key[] = [];
    for (let i = 0; i < fileNames.length; i++) {
        let sk: PrivateKey = PrivateKey.random();
        let pk: PublicKey = sk.toPublicKey();
        tempFilesData.push({
            privateKey: sk.toBase58(),
            publicKey: pk.toBase58(),
        });
    }
    filesData = tempFilesData;
}

// Function to write the files
function writeFiles() {
    filesData.forEach((data, index) => {
        const path = './keys/';
        let fileName = fileNames[index];
        fileName = path + fileName;
        const fileContent = JSON.stringify(data, null, 2);

        fs.writeFile(fileName, fileContent, (err) => {
            if (err) {
                console.error(`Error writing ${fileName}:`, err);
            } else {
                console.log(`${fileName} created successfully.`);
            }
        });
    });
}

createFileData();
writeFiles();
