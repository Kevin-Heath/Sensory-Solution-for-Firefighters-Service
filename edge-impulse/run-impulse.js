const chalk = require('chalk');
const express = require('express')
const router = express.Router();
const sharp = require('sharp')

// Load the inferencing WebAssembly module
const Module = require('../edge-impulse/edge-impulse-standalone');
const fs = require('fs');
const { cpuUsage } = require('process');

// Classifier module
let classifierInitialized = false;
Module.onRuntimeInitialized = function() {
    classifierInitialized = true;
};

class EdgeImpulseClassifier {
    // _initialized = false;

    init() {
        if (classifierInitialized === true) return Promise.resolve();

        return new Promise((resolve) => {
            Module.onRuntimeInitialized = () => {
                resolve();
                classifierInitialized = true;
            };
        });
    }

    classify(rawData, debug = false) {
        if (!classifierInitialized) throw new Error('Module is not initialized');

        const obj = this._arrayToHeap(rawData);
        let ret = Module.run_classifier(obj.buffer.byteOffset, rawData.length, debug);
        Module._free(obj.ptr);

        if (ret.result !== 0) {
            throw new Error('Classification failed (err code: ' + ret.result + ')');
        }


        let jsResult = {
            anomaly: ret.anomaly,
            results: []
        };

        // if ret.size is a function, then this is a new module. Use this API call to prevent leaks.
        // the old API (calling via ret.classification) is still there for backwards compatibility, but leaks some memory
        if (typeof ret.size === 'function') {
            for (let cx = 0; cx < ret.size(); cx++) {
                let c = ret.get(cx);
                jsResult.results.push({ label: c.label, value: c.value });
                c.delete();
            }
        }
        else {
            for (let cx = 0; cx < ret.classification.size(); cx++) {
                let c = ret.classification.get(cx);
                jsResult.results.push({ label: c.label, value: c.value });
                c.delete();
            }
        }

        ret.delete();

        return jsResult;
    }

    _arrayToHeap(data) {
        let typedArray = new Float32Array(data);
        let numBytes = typedArray.length * typedArray.BYTES_PER_ELEMENT;
        let ptr = Module._malloc(numBytes);
        let heapBytes = new Uint8Array(Module.HEAPU8.buffer, ptr, numBytes);
        heapBytes.set(new Uint8Array(typedArray.buffer));
        return { ptr: ptr, buffer: heapBytes };
    }
}

//Initialize the classifier
let classifier = new EdgeImpulseClassifier();
const cl = classifier.init();

router.post('/classify-image', async (request, response) => {
    try {

        let raw_features = [];
        let img_buf = Buffer.from(request.body.image, 'base64')

        try{
            let buf_string = img_buf.toString('hex');
            
            // store RGB pixel value and convert to integer
            for (let i=0; i<buf_string.length; i+=6) {
                raw_features.push(parseInt(buf_string.slice(i, i+6), 16));
            }
        
        } catch(error) {
            throw new Error("Error Processing Incoming Image");
        }
        

        Promise.all([cl, img_buf])
            .then(() => {
                let result = {"hasPerson":false}
                let classifier_result = classifier.classify(raw_features);
               
                no_person_value = 0
                person_value = 0

                console.log(classifier_result)

                if(classifier_result["results"][0]["label"] === "no person"){
                    no_person_value = classifier_result["results"][0]["value"]
                } else {
                    throw new Error("Invalid Model Classification Post Processing")
                }

                if(classifier_result["results"][1]["label"] === "person"){
                    person_value = classifier_result["results"][1]["value"]
                } else {
                    throw Error("Invalid Model Classification Post Processing")
                }
                
                console.log("Person Value : " + person_value)
                console.log("No Person Value:" + no_person_value)

                //CONFIGURE THESE TUNING PARAMETERS:
                person_threshold = 0.90
                no_person_threshold = 0.1

                if(person_value > person_threshold && no_person_value < no_person_threshold){
                    result["hasPerson"] = true
                    // If is person find brightspot in the image
                    let frame_data = request.body.frame
                    let column_average = new Array(32)

                    index_count = 0;
                    for(let j = 0; j < 24; j++){
                    for (let i = 0; i < 32; i ++){
                        column_average[i] = (column_average[i] || 0) + parseFloat(frame_data[index_count])
                        index_count++
                    }}

                    left_avg = 0
                    centre_avg = 0
                    right_avg = 0
                    
                    for(let i = 0; i < 16; i++){
                        left_avg = left_avg + column_average[i]
                    } 
                    for(let i = 8; i < 24; i++){
                        centre_avg = centre_avg + column_average[i]
                    } 
                    for(let i = 17; i < 32; i++){
                        right_avg = right_avg + column_average[i]
                    } 
    
                    // console.debug("left avg: " + left_avg + " | " + (left_avg/16)/24) //16 columns, 24 rows
                    // console.debug("centre avg: " + centre_avg + " | " + (centre_avg/16)/24)
                    // console.debug("right avg: " + right_avg + " | " + (right_avg/16)/24)
                        
                    var direction
                    if(left_avg > centre_avg && left_avg > right_avg){
                        direction = 1
                    } else if (centre_avg > left_avg &&  centre_avg > right_avg){
                        direction = 2
                    } else if (right_avg > left_avg && right_avg > centre_avg){
                        direction = 3
                    } else {
                        direction = 4
                    }

                    result["direction"]=direction
                } 
                return response.status(200).send(result)

            })
            .catch(err => {
                console.error(err)
                return response.status(500).send(err)
            }
        );

    } catch (err) {
        console.error(err)
        return response.status(500).send(err)
    }
});


module.exports = router 

