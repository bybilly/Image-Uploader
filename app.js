require('dotenv').config({ path: './config.env' });
const mime = require('mime');
const uniqid = require('uniqid');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('images.db');
const AWS = require('aws-sdk');
const fileUpload = require('express-fileupload');
const express = require('express');
const s3 = new AWS.S3({
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY
});
const app = express();

app.set('view engine', 'ejs');

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
                return res.render('image', { link: row.link });
            } catch {
                return res.render('error');
            }
        });
    });
});

app.post('/upload', (req, res) => {
    if (!req.files || !req.files.file) {
        return res.status(400).send('No files uploaded');
    }

    let file = req.files.file;
    
    let fileType = mime.getType(file.name);

    if (!allowedTypes.includes(fileType)) {
        return res.status(400).send('Invalid file type');
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
        if (s3Err) return res.status(400).send('Unknown error, please try again in a bit');
        console.log(`File uploaded successfully at ${data.Location}`)
        link = data.Location;

        db.serialize(() => {
            db.run(`INSERT INTO images VALUES ('${id}', '${link}');`);
        });

        res.redirect(`/image/${id}`);
    });
});


app.listen(3000);