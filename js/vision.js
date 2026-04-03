// vision.js - Handles ONNX Runtime loading and Inference

let yoloModel = null;
// Resolve model path relative to project root (works from any page location)
const _scriptEl = document.currentScript;
const _scriptDir = _scriptEl ? _scriptEl.src.substring(0, _scriptEl.src.lastIndexOf('/') + 1) : '';
const MODEL_PATH = _scriptDir ? _scriptDir + '../assets/models/best.onnx' : 'assets/models/best.onnx';
const INPUT_SIZE = 640;

// Initialize ONNX Session
async function initVisionModel() {
    try {
        Logger.group('Model Initialization');
        Logger.info(`Loading YOLO ONNX model from: ${MODEL_PATH}`);
        Logger.info(`ONNX Runtime version: ${ort.env?.versions?.web || 'unknown'}`);

        ort.env.wasm.numThreads = 1;
        yoloModel = await ort.InferenceSession.create(MODEL_PATH, { executionProviders: ['wasm'] });

        Logger.info('Model loaded successfully.');
        Logger.table('Model Details', {
            inputNames: yoloModel.inputNames.join(', '),
            outputNames: yoloModel.outputNames.join(', '),
        });
        Logger.groupEnd();
    } catch (e) {
        Logger.error(`Failed to load model: ${e.message}`);
        Logger.error(`Stack: ${e.stack}`);
        Logger.groupEnd();
    }
}

// Ensure model is loaded on script load
initVisionModel();

/**
 * Main function called by app.js to process the captured canvas.
 * @param {HTMLCanvasElement} sourceCanvas - The canvas containing the captured webcam frame.
 * @returns {Promise<{score: number, canvasElement: HTMLCanvasElement}>}
 */
window.processImageForScore = async (sourceCanvas) => {
    Logger.group('processImageForScore');

    if (!yoloModel) {
        Logger.error('Model not initialized — aborting.');
        Logger.groupEnd();
        throw new Error("Model not initialized.");
    }

    // === Stage 1: Preprocess ===
    Logger.group('Stage 1: Preprocess');
    Logger.table('Source Canvas', {
        width: sourceCanvas.width,
        height: sourceCanvas.height,
    });

    const { tensor, ratio, padX, padY } = preprocessCanvas(sourceCanvas);

    Logger.table('Preprocess Results', {
        ratio: ratio.toFixed(4),
        padX: padX.toFixed(2),
        padY: padY.toFixed(2),
        tensorShape: tensor.dims.join(' × '),
        tensorSize: tensor.data.length,
    });
    Logger.groupEnd();

    // === Stage 2: Inference ===
    Logger.group('Stage 2: Inference');
    const feeds = {};
    feeds[yoloModel.inputNames[0]] = tensor;
    Logger.info(`Running inference with input "${yoloModel.inputNames[0]}"...`);

    const t0 = performance.now();
    const results = await yoloModel.run(feeds);
    const inferenceMs = (performance.now() - t0).toFixed(1);

    const outputName = yoloModel.outputNames[0];
    const outputData = results[outputName].data;
    const dims = results[outputName].dims;

    // Compute quick stats on output tensor
    let minVal = Infinity, maxVal = -Infinity, sum = 0;
    for (let i = 0; i < outputData.length; i++) {
        if (outputData[i] < minVal) minVal = outputData[i];
        if (outputData[i] > maxVal) maxVal = outputData[i];
        sum += outputData[i];
    }
    const meanVal = sum / outputData.length;

    Logger.table('Inference Results', {
        outputName,
        outputDims: dims.join(' × '),
        outputLength: outputData.length,
        inferenceTime: `${inferenceMs} ms`,
        tensorMin: minVal.toFixed(4),
        tensorMax: maxVal.toFixed(4),
        tensorMean: meanVal.toFixed(4),
    });
    Logger.groupEnd();

    // === Stage 3: Parse Detections ===
    Logger.group('Stage 3: Parse Detections');

    const isEnd2EndFormat = dims.length === 3 && dims[2] <= 7;
    const rawDetections = parseRawDetections(outputData, dims, isEnd2EndFormat, ratio, padX, padY);

    if (rawDetections.length > 0) {
        const samples = rawDetections.slice(0, 5);
        samples.forEach((d, idx) => {
            Logger.debug(`  detection[${idx}]: class=${d.classId} conf=${d.conf.toFixed(3)} box=[${d.x.toFixed(1)}, ${d.y.toFixed(1)}, ${d.w.toFixed(1)}, ${d.h.toFixed(1)}]`);
        });
        if (rawDetections.length > 5) {
            Logger.debug(`  ... and ${rawDetections.length - 5} more`);
        }
    } else {
        Logger.warn(`No detections above confidence threshold!`);
    }
    Logger.groupEnd();

    // === Stage 4: Post-process ===
    Logger.group('Stage 4: Post-process (NMS + Filtering)');
    const { dominos, pips } = postProcessDetections(rawDetections, isEnd2EndFormat);
    Logger.groupEnd();

    // === Stage 5: Draw & Return ===
    Logger.group('Stage 5: Draw & Return');
    drawDetections(sourceCanvas, dominos, pips);
    const finalScore = pips.length;
    Logger.info(`Final score: ${finalScore} pips`);
    Logger.groupEnd();

    Logger.groupEnd(); // processImageForScore

    return {
        score: finalScore,
        canvasElement: sourceCanvas
    };
};

/**
 * Two-Pass Crop approach: detect dominos first, then crop each domino
 * and re-run inference to count pips at higher resolution.
 * @param {HTMLCanvasElement} sourceCanvas - The canvas containing the captured webcam frame.
 * @returns {Promise<{score: number, canvasElement: HTMLCanvasElement}>}
 */
window.processImageForScoreTwoPass = async (sourceCanvas) => {
    Logger.group('processImageForScoreTwoPass (Two-Pass Crop)');

    if (!yoloModel) {
        Logger.error('Model not initialized — aborting.');
        Logger.groupEnd();
        throw new Error("Model not initialized.");
    }

    // === Pass 1: Detect dominos from full image ===
    Logger.group('Pass 1: Detect Dominos (Full Image)');
    const { tensor, ratio, padX, padY } = preprocessCanvas(sourceCanvas);

    Logger.table('Source Canvas', {
        width: sourceCanvas.width,
        height: sourceCanvas.height,
        ratio: ratio.toFixed(4),
        padX: padX.toFixed(2),
        padY: padY.toFixed(2),
    });

    const feeds = {};
    feeds[yoloModel.inputNames[0]] = tensor;
    const t0 = performance.now();
    const results = await yoloModel.run(feeds);
    const pass1Ms = (performance.now() - t0).toFixed(1);

    const outputName = yoloModel.outputNames[0];
    const outputData = results[outputName].data;
    const dims = results[outputName].dims;
    const isEnd2EndFormat = dims.length === 3 && dims[2] <= 7;

    // Parse ALL detections from pass 1
    const pass1Detections = parseRawDetections(outputData, dims, isEnd2EndFormat, ratio, padX, padY);

    // Extract only dominos from pass 1
    let dominos = pass1Detections.filter(d => d.classId === 0);
    if (!isEnd2EndFormat) {
        dominos = nms(dominos, 0.45);
    }

    Logger.table('Pass 1 Results', {
        inferenceTime: `${pass1Ms} ms`,
        format: isEnd2EndFormat ? 'End2end NMS' : 'Standard',
        totalDetections: pass1Detections.length,
        dominosFound: dominos.length,
    });
    Logger.groupEnd();

    if (dominos.length === 0) {
        Logger.warn('No dominos detected — score is 0.');
        drawDetections(sourceCanvas, [], []);
        Logger.groupEnd();
        return { score: 0, canvasElement: sourceCanvas };
    }

    // === Pass 2: Crop each domino and detect pips ===
    Logger.group(`Pass 2: Detect Pips (${dominos.length} crops)`);
    const PADDING_FACTOR = 0.10; // 10% padding around each crop
    const allPips = [];

    for (let di = 0; di < dominos.length; di++) {
        const d = dominos[di];
        Logger.group(`Domino ${di + 1}/${dominos.length}`);

        // Compute padded crop region (clamped to canvas bounds)
        const padW = d.w * PADDING_FACTOR;
        const padH = d.h * PADDING_FACTOR;
        const cropX = Math.max(0, Math.round(d.x - padW));
        const cropY = Math.max(0, Math.round(d.y - padH));
        const cropX2 = Math.min(sourceCanvas.width, Math.round(d.x + d.w + padW));
        const cropY2 = Math.min(sourceCanvas.height, Math.round(d.y + d.h + padH));
        const cropW = cropX2 - cropX;
        const cropH = cropY2 - cropY;

        Logger.table('Crop Region', {
            dominoBox: `[${d.x.toFixed(0)}, ${d.y.toFixed(0)}, ${d.w.toFixed(0)}, ${d.h.toFixed(0)}]`,
            paddedCrop: `[${cropX}, ${cropY}, ${cropW}, ${cropH}]`,
            padding: `${(PADDING_FACTOR * 100).toFixed(0)}%`,
        });

        if (cropW < 5 || cropH < 5) {
            Logger.warn('Crop too small, skipping.');
            Logger.groupEnd();
            continue;
        }

        // Create a cropped canvas
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = cropW;
        cropCanvas.height = cropH;
        const cropCtx = cropCanvas.getContext('2d');
        cropCtx.drawImage(sourceCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

        // Preprocess crop and run inference
        const cropPrep = preprocessCanvas(cropCanvas);
        const cropFeeds = {};
        cropFeeds[yoloModel.inputNames[0]] = cropPrep.tensor;

        const t1 = performance.now();
        const cropResults = await yoloModel.run(cropFeeds);
        const pass2Ms = (performance.now() - t1).toFixed(1);

        const cropOutput = cropResults[outputName].data;
        const cropDims = cropResults[outputName].dims;
        const cropIsEnd2End = cropDims.length === 3 && cropDims[2] <= 7;

        // Parse detections from crop
        const cropDetections = parseRawDetections(
            cropOutput, cropDims, cropIsEnd2End,
            cropPrep.ratio, cropPrep.padX, cropPrep.padY
        );

        // Filter to pips only
        let cropPips = cropDetections.filter(det => det.classId === 1);

        // Apply NMS on crop pips
        cropPips = nms(cropPips, 0.5);

        Logger.table(`Crop ${di + 1} Results`, {
            inferenceTime: `${pass2Ms} ms`,
            rawDetections: cropDetections.length,
            pipsAfterNMS: cropPips.length,
        });

        // Map pip coordinates from crop-space back to original image space
        for (const pip of cropPips) {
            allPips.push({
                classId: pip.classId,
                conf: pip.conf,
                x: pip.x + cropX,
                y: pip.y + cropY,
                w: pip.w,
                h: pip.h,
            });
        }

        Logger.groupEnd(); // Domino N
    }

    Logger.info(`Total pips across all crops: ${allPips.length}`);
    Logger.groupEnd(); // Pass 2

    // === Draw & Return ===
    Logger.group('Draw & Return');
    drawDetections(sourceCanvas, dominos, allPips);
    const finalScore = allPips.length;
    Logger.info(`Final score (two-pass): ${finalScore} pips`);
    Logger.groupEnd();

    Logger.groupEnd(); // processImageForScoreTwoPass

    return {
        score: finalScore,
        canvasElement: sourceCanvas
    };
};

/**
 * Parse raw output tensor into detection objects.
 * Supports both End2end NMS format [1, N, 6] and Standard format [1, features, anchors].
 */
function parseRawDetections(outputData, dims, isEnd2EndFormat, ratio, padX, padY) {
    const CONF_THRESHOLD = 0.5;
    const detections = [];

    if (isEnd2EndFormat) {
        const numDetections = dims[1];
        const valuesPerDet = dims[2];
        Logger.info(`Format: End2end NMS — ${numDetections} detections × ${valuesPerDet} values`);

        for (let i = 0; i < numDetections; i++) {
            const offset = i * valuesPerDet;
            const x1 = outputData[offset + 0];
            const y1 = outputData[offset + 1];
            const x2 = outputData[offset + 2];
            const y2 = outputData[offset + 3];
            const conf = outputData[offset + 4];
            const classId = Math.round(outputData[offset + 5]);

            if (conf < CONF_THRESHOLD) continue;

            detections.push({
                classId,
                conf,
                x: (x1 - padX) / ratio,
                y: (y1 - padY) / ratio,
                w: (x2 - x1) / ratio,
                h: (y2 - y1) / ratio,
            });
        }

        Logger.info(`End2end: ${detections.length}/${numDetections} above threshold ${CONF_THRESHOLD}`);
    } else {
        const numClasses = dims[1] - 4;
        const numAnchors = dims[2];
        Logger.info(`Format: Standard — ${numAnchors} anchors × ${numClasses} classes`);

        const sigmoid = (x) => 1 / (1 + Math.exp(-x));

        for (let i = 0; i < numAnchors; i++) {
            let maxConf = 0;
            let classId = -1;

            for (let c = 0; c < numClasses; c++) {
                const rawLogit = outputData[(4 + c) * numAnchors + i];
                const conf = sigmoid(rawLogit);
                if (conf > maxConf) {
                    maxConf = conf;
                    classId = c;
                }
            }

            if (maxConf > CONF_THRESHOLD) {
                const cx = outputData[0 * numAnchors + i];
                const cy = outputData[1 * numAnchors + i];
                const w = outputData[2 * numAnchors + i];
                const h = outputData[3 * numAnchors + i];

                detections.push({
                    classId,
                    conf: maxConf,
                    x: (cx - padX - (w / 2)) / ratio,
                    y: (cy - padY - (h / 2)) / ratio,
                    w: w / ratio,
                    h: h / ratio,
                });
            }
        }

        Logger.info(`Standard: ${detections.length}/${numAnchors} above threshold ${CONF_THRESHOLD}`);
    }

    return detections;
}

/**
 * Resize and pad the image to fit the 640x640 model input
 */
function preprocessCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const ratio = Math.min(INPUT_SIZE / canvas.width, INPUT_SIZE / canvas.height);
    const newW = Math.round(canvas.width * ratio);
    const newH = Math.round(canvas.height * ratio);
    const padX = (INPUT_SIZE - newW) / 2;
    const padY = (INPUT_SIZE - newH) / 2;

    const paddedCanvas = document.createElement('canvas');
    paddedCanvas.width = INPUT_SIZE;
    paddedCanvas.height = INPUT_SIZE;
    const paddedCtx = paddedCanvas.getContext('2d');

    paddedCtx.fillStyle = "rgba(114, 114, 114, 1)";
    paddedCtx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);

    paddedCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height, padX, padY, newW, newH);

    const pixels = paddedCtx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data;
    const tensorData = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);

    for (let i = 0; i < INPUT_SIZE * INPUT_SIZE; i++) {
        const r = pixels[i * 4 + 0] / 255.0;
        const g = pixels[i * 4 + 1] / 255.0;
        const b = pixels[i * 4 + 2] / 255.0;

        tensorData[i] = r;
        tensorData[INPUT_SIZE * INPUT_SIZE + i] = g;
        tensorData[2 * INPUT_SIZE * INPUT_SIZE + i] = b;
    }

    return {
        tensor: new ort.Tensor('float32', tensorData, [1, 3, INPUT_SIZE, INPUT_SIZE]),
        ratio,
        padX,
        padY
    };
}

function iou(boxA, boxB) {
    const ax1 = boxA.x, ay1 = boxA.y, ax2 = boxA.x + boxA.w, ay2 = boxA.y + boxA.h;
    const bx1 = boxB.x, by1 = boxB.y, bx2 = boxB.x + boxB.w, by2 = boxB.y + boxB.h;

    const interX1 = Math.max(ax1, bx1);
    const interY1 = Math.max(ay1, by1);
    const interX2 = Math.min(ax2, bx2);
    const interY2 = Math.min(ay2, by2);

    const interW = Math.max(0, interX2 - interX1);
    const interH = Math.max(0, interY2 - interY1);
    const interArea = interW * interH;

    const areaA = boxA.w * boxA.h;
    const areaB = boxB.w * boxB.h;
    const unionArea = areaA + areaB - interArea;

    return unionArea > 0 ? interArea / unionArea : 0;
}

function nms(boxes, iouThreshold = 0.5) {
    boxes.sort((a, b) => b.conf - a.conf);
    const keep = [];
    const active = new Array(boxes.length).fill(true);

    for (let i = 0; i < boxes.length; i++) {
        if (!active[i]) continue;
        keep.push(boxes[i]);
        for (let j = i + 1; j < boxes.length; j++) {
            if (active[j] && iou(boxes[i], boxes[j]) > iouThreshold) {
                active[j] = false;
            }
        }
    }
    return keep;
}

function centerInBox(pipBox, dominoBox) {
    const cx = pipBox.x + pipBox.w / 2;
    const cy = pipBox.y + pipBox.h / 2;
    return cx >= dominoBox.x && cx <= dominoBox.x + dominoBox.w &&
        cy >= dominoBox.y && cy <= dominoBox.y + dominoBox.h;
}

function postProcessDetections(detections, isEnd2EndFormat = false) {
    let dominos = detections.filter(d => d.classId === 0);
    let rawPips = detections.filter(d => d.classId === 1);

    Logger.info(`Raw: ${dominos.length} dominos, ${rawPips.length} pips`);

    let dedupedPips;
    if (isEnd2EndFormat) {
        // End2end format: model already performed NMS, but apply a second
        // JS-side NMS pass to match the Python app's double-dedup behavior.
        // This prevents near-duplicate pip detections at high pip counts.
        dedupedPips = nms(rawPips, 0.5);
        Logger.info(`Post-NMS (end2end + JS dedup): ${rawPips.length} → ${dedupedPips.length} pips`);
    } else {
        // Standard format: apply NMS ourselves
        dominos = nms(dominos, 0.45);
        dedupedPips = nms(rawPips, 0.5);
        Logger.info(`Post-NMS: ${dominos.length} dominos, ${dedupedPips.length} pips`);
    }

    // Filter pips whose center is inside a domino
    let finalPips = dedupedPips.filter(pip =>
        dominos.some(domino => centerInBox(pip, domino))
    );

    Logger.info(`After pip-in-domino filter: ${finalPips.length} pips (removed ${dedupedPips.length - finalPips.length})`);

    if (dominos.length === 0 && rawPips.length > 0) {
        Logger.warn('Pips found but NO dominos detected — all pips will be filtered out!');
    }
    if (dedupedPips.length > 0 && finalPips.length === 0 && dominos.length > 0) {
        Logger.warn('Dominos found but no pip centers fall inside domino boxes — check coordinate mapping!');
    }

    return { dominos, pips: finalPips };
}

function drawDetections(canvas, dominos, pips) {
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 4;
    ctx.font = "18px Arial";

    // Draw dominos (Blue)
    ctx.strokeStyle = "rgba(0, 0, 255, 0.8)";
    ctx.fillStyle = "rgba(0, 0, 255, 0.8)";
    dominos.forEach(d => {
        ctx.strokeRect(d.x, d.y, d.w, d.h);
        ctx.fillText(`Domino ${d.conf.toFixed(2)}`, d.x, d.y > 20 ? d.y - 5 : d.y + 20);
    });

    // Draw pips (Red)
    ctx.strokeStyle = "rgba(255, 0, 0, 0.8)";
    ctx.fillStyle = "rgba(255, 0, 0, 0.8)";
    pips.forEach(p => {
        ctx.strokeRect(p.x, p.y, p.w, p.h);
    });
}
