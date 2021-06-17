require('dotenv').config({ path: './config.env' });
const mime = require('mime');
const uniqid = require('uniqid');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('images.db');
const AWS = require('aws-sdk');
const fileUpload = require('express-fileupload');
const https = require('https');
const express = require('express');
const s3 = new AWS.S3({
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY
});
const app = express();

const privateKey = fs.readFileSync('/etc/letsencrypt/live/uploader.bybilly.uk/privkey.pem', 'utf8');
const certificate = fs.readFileSync('/etc/letsencrypt/live/uploader.bybilly.uk/fullchain.pem', 'utf8');

const credentials = {key: privateKey, cert: certificate};

app.set('view engine', 'ejs');
app.use(express.json());

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS images (id INT NOT NULL PRIMARY KEY, link VARCHAR(40));");
});

app.use(fileUpload({
    limits: { fileSize: 50 * 1024 * 1024 }
}));

const allowedTypes = ['image/gid', 'image/jpeg', 'image/png', 'image/tiff'];

app.get('/', (req, res) => {
    res.render('index');
});

app.get('/image/:id', (req, res) => {
    let id = req.params.id;
    db.serialize(() => {
        db.get('SELECT link FROM images WHERE id = ?;', [id], (err, row) => {
            if (err) return res.render('error');
            try {
                return res.render('image', { id: id, link: row.link });
            } catch {
                return res.render('error');
            }
        });
    });
});

app.post('/upload', (req, res) => {
    if (!req.files || !req.files.file) {
        return res.status(400).json({error: 'No files uploaded'});
    }

    let file = req.files.file;
    
    let fileType = mime.getType(file.name);

    if (!allowedTypes.includes(fileType)) {
        return res.status(400).json({error: 'Invalid file type'});
    }

    let id = uniqid.time();
    let key = `${id}.${mime.getExtension(fileType)}`;

    const uploadParams = {
        Bucket: 'bybillyuploader',
        Key: key,
        Body: file.data,
        ACL:'public-read'
    };

    let link;
    s3.upload(uploadParams, function(s3Err, data) {
        if (s3Err) return res.status(400).json({error: 'Unknown error, please try again later'});
        console.log(`File uploaded successfully at ${data.Location}`)
        link = data.Location;

        db.serialize(() => {
            db.run(`INSERT INTO images VALUES ('${id}', '${link}');`);
        });

        res.status(200).json({ url: `/image/${id}` });
    });
});

const httpServer = http.createServer(app);
const httpsServer = https.createServer(credentials, app);

httpServer.listen(80);
httpsServer.listen(443);
console.log("Server running on port 80 and 443");