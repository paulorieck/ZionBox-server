const Datastore = require('nedb');
const db = new Datastore({filename: 'local_dbs/topics.db', autoload: true});

module.exports = {

    add: function (obj, callback) {

        db.insert(obj, function (error, newDoc) {
            if ( error ) {
                console.log("Error:");
                console.log(error);
            }
            callback(newDoc);
        });

    },

    update: function (obj, callback) {

        db.update({_id: obj._id}, {$set: {peers: obj.peers, metadata_hash: obj.metadata_hash}}, { multi: true }, function (err, numReplaced) {
            callback();
        });

    },

    getTopicByTopicId: function (topicId, callback) {

        db.find({topic: topicId}, function (error, docs) {
            if ( error ) {
                console.log("Error:");
                console.log(error);
            }
            callback(docs);
        });

    },

    getAllTopics: function (callback) {

        db.find({}, function (error, docs) {
            if ( error ) {
                console.log("Error:");
                console.log(error);
            }
            callback(docs);
        });

    },

}