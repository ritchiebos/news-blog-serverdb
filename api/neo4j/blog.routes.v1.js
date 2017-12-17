//
// Neo4j: GraphDB
// ./api/v1/blog.routes.v1.js
//
var express = require('express');
var routes = express.Router();
var neo4jdb = require('../../config/neo4j.db');
var Blog = require('../../model/neo4j/blog.model');
var ArchiveSchema = require('../../model/archive.model');
var BlogSchema = require('../../model/blog.model');
var AuthorSchema = require('../../model/author.model');

//
// Neo4j: GraphDB
// Geef een lijst van alle blogs.
//
routes.get('/blogs', function (req, res) {
    res.contentType('application/json');
    const query = 'MATCH (blog:Blog)-[hs:HAS_SUMMARY]->(s:Summary) RETURN blog, hs, s';
    let blogs = [];

    neo4jdb.run(query).then((result) => {
        result.records.forEach((record) => {
            rec = record;
            const id = record._fields[0].properties._id.toString();
            const title = record._fields[0].properties.title.toString();
            const author = record._fields[0].properties.author.toString();
            const timestamp = record._fields[0].properties.timestamp.toString();
            const summary = record._fields[2].properties.summary.toString();
            const blog = new Blog(id, title, author, timestamp, summary);
            blogs.push(blog);
        });
        neo4jdb.close();
    }).then(() => {
        res.status(200).json(blogs);
    }).catch((error) => {
        res.status(400).json(error);
    })
});

//
// Neo4j; GraphDB
// Retourneer één specifieke blog. Hier maken we gebruik van URL parameters.
// Vorm van de URL: http://hostname:3000/api/v1/blogs/23
//
routes.get('/blogs/:id', function (req, res) {
    res.contentType('application/json');
    const id = req.params.id.toString();
    const query = `
        MATCH (blog:Blog)-[hs:HAS_SUMMARY]->(s:Summary)-[ht:HAS_TEXT]->(t:Text) 
        WHERE blog._id = {id} 
        RETURN blog, hs, s, ht, t
    `;
    let blog = null;

    neo4jdb.run(query, {id: id}).then((result) => {
        result.records.forEach((record) => {
            const id = record._fields[0].properties._id.toString();
            const title = record._fields[0].properties.title.toString();
            const author = record._fields[0].properties.author.toString();
            const timestamp = record._fields[0].properties.timestamp.toString();
            const summary = record._fields[2].properties.summary.toString();
            const text = record._fields[4].properties.text.toString();
            blog = new Blog(id, title, author, timestamp, summary, text);
        });
        neo4jdb.close();
    }).then(() => {
        res.status(200).json(blog);
    }).catch((error) => {
        res.status(400).json(error);
    });
});

//
// Voeg een blog toe. De nieuwe info wordt gestuurd via de body van de request message.
// Vorm van de URL: POST http://hostname:3000/api/v1/blogs
//
routes.post('/blogs', function (req, res) {
    res.contentType('application/json');
    const data = req.body.data;
    const year = new Date(data._timestamp).getFullYear();
    const month = new Date(data._timestamp).getMonth();
    const datestamp = new Date(year, month);
    const blogSchema = new BlogSchema({
        _title: data._title,
        _timestamp: data._timestamp,
        _summary: data._summary,
        _text: data._text
    })
    let newAuthor = false;

    promises = [];
    promises[0] = AuthorSchema.findById(data._author._id).then((author) => {
        if(author) {
            return blogSchema._author = author;
        } else {
            newAuthor = true;
            return blogSchema._author = new AuthorSchema({  
                _name: data._author._name 
            });
        }
    });

    promises[1] = ArchiveSchema.findOne({ _datestamp: datestamp}).then((archive) => {
        if(archive) {
            archive._blogs.push(blogSchema);
            return archive;
        } else {
            archive = new ArchiveSchema({
                _datestamp: datestamp
            });
            archive._blogs.push(blogSchema);
            return archive;
        }
    });

    Promise.all([
        promises[1].then((archive) => {
            archive.save();
        }),
        promises[0].then((author) => {
            if(newAuthor) {
                const id = author._id.toString();
                const name = author._name;
                const query = `
                    CREATE (author:Author { _id: {id}, name: {name} })
                `;
                neo4jdb.run(query, {id: id, name: name})
            }
            author.save();
        })
    ]).then(() => {
        blogSchema.save().then((blog) => {
            const id = blog._id.toString();
            const title = blog._title;
            const author = blog._author._id.toString();
            const timestamp = blog._timestamp.toString();
            const summary = blog._summary;
            const text = blog._text;
            const authorNode = '(author:Author { _id: {author} })';
            const createdBy = '(author)<-[:CREATED_BY]-';
            const blogNode = '(blog:Blog { _id: {id}, title: {title}, author: {author}, timestamp: {timestamp} })'
            const summaryNode = '(s:Summary { summary: {summary} })';
            const textNode = '(t:Text { text: {text} })';
            const summaryRel = '-[hs:HAS_SUMMARY]->';
            const textRel = '-[ht:HAS_TEXT]->'
            const query = 'MATCH ' + authorNode + ' CREATE ' + createdBy + blogNode + summaryRel + summaryNode + textRel + textNode;
            neo4jdb.run(query, {id: id, title: title, author: author, timestamp: timestamp, summary: summary, text: text});
            res.send(blog);
        }).catch((error) => {
            res.status(401).json(error);
        })
    }).then(() => {
        neo4jdb.close();
    });
});

module.exports = routes;