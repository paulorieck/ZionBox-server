const fs = require('fs');

const topicsDao = require('./TopicsDao');

var express = require("express");
var session = require('express-session');

var NedbStore = require('nedb-session-store')(session);

var app = express();

const http = require('http');
const WebSocketServer = require('ws').Server;

var server = http.createServer(app);
const wss = new WebSocketServer({server});

var confs = JSON.parse(fs.readFileSync("configs.json"));

var connected_clients = [];
var sockets = []

var session_conf = 
{
    secret: 'ipfssyncro_h5cg78rjdfl0x7',
    cookie:{
        maxAge: 3600000
    },
    store: new NedbStore({
        filename: 'local_dbs/sessions.db'
    })
};
var sess = session(session_conf);
console.log("store: "+sess.store);

app.use(sess);

app.use(express.static('www'));

var bodyParser = require('body-parser');
app.use(bodyParser.json()); // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({extended: true})); // to support URL-encoded bodies

wss.on('error', err => {
    console.dir(err);
});

app.post("/get_topics/", function (req, res) {

    var topics_ids = req.body.topics_ids;
    var peerId = req.body.peerId;
    var login_multi_addresses = req.body.login_multi_addresses;

    getTopics(0, topics_ids, [], function (topics) {

        var multi_addresses = [];
        for (var i = 0; i < topics.length; i++) {

            for (var j = 0; j < topics[i].peers.length; j++) {

                for (var k = 0; k < sockets.length; k++) {
                    if ( topics[i].peers[j] === sockets[k].peerId && sockets[k].peerId !== peerId ) {

                        sockets[k].send(JSON.stringify({'op': 'inform_new_login', 'login_multi_addresses': login_multi_addresses}));
                        multi_addresses.push(sockets[k].multi_addresses);

                    }
                }

            }

        }

        res.send({'topics': topics, 'multi_addresses': multi_addresses});

    });

});

app.post("/register_new_topic/", function (req, res) {

    var topic = req.body.topic;
    var peerId = req.body.peerId;

    var newTopic = {"topic": topic, "peers": [peerId], "metadata_hash": topic};
    topicsDao.add(newTopic, function () {});

});

app.post("/change_metadata_hash_on_topic/", function (req, res) {

    var topic_ = req.body.topic;
    var peerId = req.body.peerId;
    var metadata_hash = req.body.metadata_hash;

    topicsDao.getTopicByTopicId(topic_, function (topic) {

        topic = topic[0];
        var old_metadata_hash = topic.metadata_hash;
        var topic_id = topic.topic;

        topic.metadata_hash = metadata_hash;

        topicsDao.update(topic, function () {});

        // Inform all subscribed peers about changes
        var peers = topic.peers;
        for (var i = 0; i < peers.length; i++) {
            for (var j = 0; j < sockets.length; j++) {
                if ( sockets[j].peerId === peers[i] && peerId !== sockets[j].peerId ) {
                    sockets[j].send(JSON.stringify({'op': 'notify_changed_metadata_hash', 'topic': topic_id, 'old_metadata_hash': old_metadata_hash, 'new_metadata_hash': metadata_hash}));
                    break;
                }
            }
        }

    });

});

app.post("/add_peer_to_topic/", function (req, res) {

    var topic_id = req.body.topic;
    var peerId = req.body.peerId;
    var login_multi_addresses = req.body.login_multi_addresses;

    console.log("login_multi_addresses: "+login_multi_addresses);

    topicsDao.getTopicByTopicId(topic_id, function (topic) {

        topic = topic[0];

        // Checks if the peer is already listing on this topic
        var exists = false;
        for (var i = 0; i < topic.peers.length; i++) {
            if ( peerId === topic.peers[i] ) {
                exists = true;
                break;
            }
        }
        
        if ( !exists ) {

            topic.peers.push(peerId);
            topicsDao.update(topic, function () {

                var res_topics = [];

                // Inform other peers about the new ingressed peer
                for (var j = 0; j < topic.peers.length; j++) {
                    for (var k = 0; k < sockets.length; k++) {
                        if ( topic.peers[j] === sockets[k].peerId && sockets[k].peerId !== peerId ) {
                            sockets[k].send(JSON.stringify({'op': 'inform_new_login', 'login_multi_addresses': login_multi_addresses}));
                            res_topics.push(sockets[k].multi_addresses);
                        }
                    }
                }

                // Get the peers from the new topic
                res.send({"metadata_hash": topic.metadata_hash, "multi_addresses": res_topics});

            });

        } else {

            var res_topics = [];

            // Inform other peers about the new ingressed peer
            for (var j = 0; j < topic.peers.length; j++) {
                for (var k = 0; k < sockets.length; k++) {
                    if ( topic.peers[j] === sockets[k].peerId && sockets[k].peerId !== peerId ) {
                        sockets[k].send(JSON.stringify({'op': 'inform_new_login', 'login_multi_address': login_multi_address}));
                        res_topics.push(sockets[k].multi_address);
                    }
                }
            }

            // Get the peers from the new topic
            res.send({"metadata_hash": topic.metadata_hash, "multi_address": res_topics});

        }

    });

});

function getTopics(counter, topics_ids, topics, callback) {

    console.log("counter: "+counter);

    if ( topics_ids.length > 0 ) {

        console.log("topics_ids[counter]: "+topics_ids[counter]);
        console.log(topics_ids[counter]);

        topicsDao.getTopicByTopicId(topics_ids[counter], function (topic) {
            
            console.log("topic: ");
            console.log(topic);

            if ( topic.length > 0 ) {

                topic = topic[0];
                topics.push(topic);

                counter++;

                if ( counter < topics.length ) {
                    getTopics(counter, topics_ids, topics, function (topics_) {
                        callback(topics_);
                    })
                } else {
                    callback(topics);
                }

            } else {

                callback(topics);

            }

        });

    }

}

wss.on('connection', (socket, req) => {

    console.log('WebSocket client connected...');
    sess(req, {}, () => {
        console.log('Session is parsed!');
    });

    socket.on('error', err => {
        console.dir(err);
    });

    socket.on('message', data => {
        
        data = JSON.parse(data);

        console.log("received message: ");
        console.log(data);

        if ( data.op === 'register_client' ) {

            // Add socket to sockets array
            socket.peerId = data.peerId;
            socket.multi_addresses = data.multi_addresses;

            sockets.push(socket);
            connected_clients.push(data.peerId);

            console.log("Socket succesfully registered!");

        }

    });

    socket.on('close', () => {

        // Eliminates socket from sockets array
        for (var k = 0; k < sockets.length; k++) {
            if ( sockets[k].peerId === socket.peerId ) {
                sockets.splice(k,1);
            }
        }

        console.log('Socket closed');

    });

});

wss.on('listening', () => {
    console.log('Listening...');
});

// -----Web Socket (END) --------------------

server.listen(confs.mirror_server, function () {
    console.log('IPFSSyncro Web Server listening on port '+confs.mirror_server+'!');
});