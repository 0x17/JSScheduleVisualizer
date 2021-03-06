/**
 * Created by a.schnabel on 26.09.2016.
 */

var exampleScheduleData = {
    'durations': [0, 4, 2, 2, 5, 0],
    'capacities': [8, 4],
    'demands': [[0, 0, 2, 2, 1, 0], [0, 1, 1, 0, 1, 0]],
    'sts': [0, 0, 4, 6, 2, 8]
};

var exampleObjectives = {
    'objval': 23,
    'costs': 18,
    'qlevelfinish': 3,
    'attrlevel0': 18,
    'attrlevel1': 20,
};

var qlevel_captions = ['A', 'B', 'C'];

class Vec2 {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
}

class Rectangle {
    constructor(x, y, w, h) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
    }

    containsPoint(point) {
        return point.x >= this.x && point.x <= this.x + this.w && point.y >= this.y && point.y <= this.y + this.h;
    }
}

class Parsing {
    static gamsOutputLinesToObject(lines) {
        var lineToInt = function(line) { return parseInt(line.trim()); };
        var obj = {};
        obj.numJobs = lineToInt(lines[0]);
        obj.numRes = lineToInt(lines[1]);
        obj.durations = [];
        var offset = 2;
        for(let i=0; i<obj.numJobs; i++) {
            obj.durations.push(lineToInt(lines[offset+i]));
        }
        offset += obj.numJobs;
        obj.capacities = [];
        for(let r=0; r<obj.numRes; r++) {
            obj.capacities.push(lineToInt(lines[offset+r]));
        }
        offset += obj.numRes;
        obj.demands = [];
        for(let r=0; r<obj.numRes; r++) {
            obj.demands.push([]);
            for(let j=0; j<obj.numJobs; j++) {
                obj.demands[r].push(lineToInt(lines[offset+r*obj.numJobs+j]));
            }
        }
        offset += obj.numRes*obj.numJobs;
        obj.sts = [];
        for(let j=0; j<obj.numJobs; j++) {
            obj.sts.push(lineToInt(lines[offset+j]));
        }
        return obj;
    }

    static parseObjectives(lines_str) {
        var lines = lines_str.split('\n');
        var lineToInt = function(line) { return parseInt(line.trim()); };
        var keys = ['objval', 'costs', 'qlevelfinish', 'attrlevel0', 'attrlevel1'];
        var obj = {};
        var ctr = 0;
        for(let k of keys) {
            var x = lineToInt(lines[ctr]);
            obj[k] = lineToInt(lines[ctr]);
            ctr += 1;
        }
        return obj;
    }

    static loadPalette(lines_str) {
        var rcolors = [];
        var lines = lines_str.split('\n');
        for(let j = 0; j< lines.length; j++) {
            let parts = lines[j].split(';');
            rcolors.push({'textcolor': parts[2], 'rectcolor': parts[1]});
        }
        return rcolors;
    }
}

class Drawing {
    static drawRect(paper, rect, text, fillcolor = '#ff0', bordercolor = '#000', textcolor = '#000') {
        var rectangle = paper.rect(rect.x, rect.y - rect.h, rect.w, rect.h).attr('fill', fillcolor).attr('stroke', bordercolor);
        var centerPos = new Vec2(rect.x + rect.w / 2.0, rect.y - rect.h / 2.0);
        var txt = paper.text(centerPos.x, centerPos.y, text).attr('font-size', 22).attr('fill', textcolor);
        return [rectangle, txt];
    }

    static drawLine(paper, base, offset) {
        var pth = paper.path('M' + base.x + ',' + base.y + 'L' + (base.x + offset.x) + ',' + (base.y + offset.y));
        pth.attr('stroke', '#000');
        pth.attr('stroke-width', 2);
        return pth;
    }

    static drawArrow(paper, base, offset) {
        return Drawing.drawLine(paper, base, offset).attr('arrow-end', 'classic-wide-long');
    }
}

class Helpers {
    static fill2(s) { if(s.length == 1) return '0' + s; else return s; }

    static randomColors() {
        var genPair = function() {
            var r = parseInt(Math.random() * 255);
            var g = parseInt(Math.random() * 255);
            var b = parseInt(Math.random() * 255);
            var brightness = (r + g + b) / (3.0 * 255.0);
            return [brightness, '#' + Helpers.fill2(r.toString(16)) + Helpers.fill2(g.toString(16)) + Helpers.fill2(b.toString(16))];
        };

        var pair = genPair();
        var textcolor = pair[0] < 0.5 ? '#fff' : '#000';
        return { 'textcolor': textcolor, 'rectcolor': pair[1] };
    }

    static batchGet(filenames, processPayloads) {
        var getRecursive = function(fns, payloads) {
            if(fns.length <= 0) {
                processPayloads.apply(this, payloads);
            } else {
                jQuery.get(fns[0], function(contents) {
                    var npayloads = payloads.slice(0);
                    npayloads.push(contents);
                    getRecursive(fns.slice(1), npayloads);
                });
            }
        };
        getRecursive(filenames, []);
    }
}

class ScheduleData {
    constructor(data, palette) {
        Math.seedrandom('99');

        for (var attr in data) {
            this[attr] = data[attr];
        }

        this.numJobs = this.durations.length;
        this.numRes = this.capacities.length;
        this.numPeriods = this.durations.reduce(function (a, b) { return a + b; }, 0);

        console.assert(this.numJobs == this.demands[0].length);
        console.assert(this.numJobs == this.sts.length);
        console.assert(this.numRes == this.demands.length);

        this.scale = 50.0;
        this.origin = new Vec2(100, this.targetHeight()-75);

        this.selectedResource = 0;

        this.recomputeRects = true;
        this.overlayObjects = {};

        this.rcolors = palette;
    }

    getDemand(j, r) {
        return this.demands[r][j];
    }

    ft(j) { return this.sts[j] + this.durations[j]; }

    drawQuad(paper, j, rcolors, xOffset, yOffset) {
        var rgeometry = new Rectangle(this.origin.x + xOffset, this.origin.y + yOffset, this.scale, this.scale);
        Drawing.drawRect(paper, rgeometry, (j+1), rcolors.rectcolor, '#000', rcolors.textcolor);
        if(this.recomputeRects) {
            this.jobRects[j].push(new Rectangle(rgeometry.x, rgeometry.y-rgeometry.h, rgeometry.w, rgeometry.h));
        }
    }

    drawAxes(paper) {
        Drawing.drawArrow(paper, this.origin, new Vec2((this.numPeriods +1) * this.scale, 0));
        paper.text(this.origin.x + (this.numPeriods + 2) * this.scale, this.origin.y, 'Time').attr('font-size', 22);
        for(let t = 0; t <= this.numPeriods; t++) {
            Drawing.drawLine(paper, new Vec2(this.origin.x + t * this.scale, this.origin.y), new Vec2(0, this.scale));
            if(t < this.numPeriods) {
                let boxCenter = new Vec2(this.origin.x + (t + 0.5) * this.scale, this.origin.y + this.scale * 0.5);
                paper.text(boxCenter.x, boxCenter.y, (t+1)).attr('font-size', 22);
            }
        }

        var capr = this.capacities[this.selectedResource];

        Drawing.drawArrow(paper, this.origin, new Vec2(0, -(capr+1) * this.scale));
        paper.text(this.origin.x, this.origin.y - (capr + 1.5) * this.scale, 'Resource '+(this.selectedResource+1)).attr('font-size', 22);

        for(let k = 0; k <= capr; k++) {
            Drawing.drawLine(paper, new Vec2(this.origin.x - this.scale, this.origin.y - this.scale * k), new Vec2(this.scale, 0));
            if(k < capr) {
                let boxCenter = new Vec2(this.origin.x - 0.5 * this.scale, this.origin.y - this.scale * (k + 0.5));
                paper.text(boxCenter.x, boxCenter.y, (k+1)).attr('font-size', 22);
            }
        }
        paper.text(this.origin.x - this.scale * 1.5, this.origin.y - this.scale * capr, 'Kr').attr('font-size', 22);

        Drawing.drawLine(paper, new Vec2(this.origin.x, this.origin.y - capr * this.scale), new Vec2((this.numPeriods +1) * this.scale, 0)).attr('stroke', 'red').attr('stroke-dasharray', '--');
    }

    draw(paper, attrs) {
        this.drawAxes(paper);

        if(this.recomputeRects) {
            this.jobRects = [];
            for(let j=0; j<this.numJobs; j++) {
                this.jobRects.push([]);
            }
        }

        for(let t = 1; t <= this.numPeriods; t++) {
            var yOffset = 0;
            var xOffset = (t-1) * this.scale;
            for(let j = 0; j < this.numJobs; j++) {
                if(this.sts[j] >= 0 && this.sts[j] < t && t <= this.ft(j)) {
                    for(let c = 0; c < this.getDemand(j, this.selectedResource); c++) {
                        this.drawQuad(paper, j, this.rcolors[j], xOffset, yOffset);
                        yOffset -= this.scale;
                    }
                }
            }
        }

        this.getAttributesStr(paper, attrs);

        if(this.greyRect === undefined)
            this.greyRect = paper.rect(0, 0, this.targetWidth(), this.targetHeight()).attr('fill', '#eee').attr('opacity', 0.5);

        this.recomputeRects = false;
    }

    changeResource(nres) {
        if(nres == this.selectedResource)
            return false;

        this.selectedResource = nres;
        this.recomputeRects = true;
        return true;
    }

    getResourceOptionStr() {
        var outStr = '';
        for(let r = 0; r < this.numRes; r++) {
            outStr += '<option>Resource ' + (r+1) + '</option>';
        }
        return outStr;
    }

    targetHeight() {
        return this.scale * (Math.max(...this.capacities)+4);
    }

    targetWidth() {
        return this.scale * (this.numPeriods+5);
    }

    getMakespan() {
        return this.sts[this.numJobs-1];
    }

    checkJobHovering(pos) {
        for(let j=0; j<this.numJobs; j++) {
            for(let rect of this.jobRects[j]) {
                if(rect.containsPoint(pos)) {
                    return j;
                }
            }
        }
        return undefined;
    }

    getJobOverlay(paper, pos, jobId, opacityLevel = 0.95) {
        if(this.overlayObjects[jobId] === undefined) {
            var r = new Rectangle(pos.x, pos.y, this.durations[jobId] * this.scale, this.getDemand(jobId, this.selectedResource) * this.scale);
            var pair = Drawing.drawRect(paper, r, jobId+1, this.rcolors[jobId].rectcolor, '#000', this.rcolors[jobId].textcolor);
            pair[0].attr('opacity', opacityLevel);
            pair[1].attr('opacity', opacityLevel);
            var retObj = {};
            retObj.arrow1 = Drawing.drawArrow(paper, new Vec2(r.x, r.y+10), new Vec2(r.w, 0)).attr('opacity', opacityLevel);
            retObj.arrow2 = Drawing.drawArrow(paper, new Vec2(r.x-10, r.y), new Vec2(0, -r.h)).attr('opacity', opacityLevel);
            retObj.demandText = paper.text(r.x-30, r.y-r.h/2, 'k'+(jobId+1)+'='+this.getDemand(jobId, this.selectedResource)).attr('font-size', 15).attr('opacity', opacityLevel);
            retObj.durationText = paper.text(r.x+r.w/2, r.y+30, 'd'+(jobId+1)+'='+this.durations[jobId]).attr('font-size', 15).attr('opacity', opacityLevel);
            retObj.rectangle = pair[0];
            retObj.rectGlow = retObj.rectangle.glow({ 'width': 5 });
            retObj.text = pair[1];
            retObj.lastpos = pos;
            this.overlayObjects[jobId] = retObj;
            return retObj;
        } else {
            return this.overlayObjects[jobId];
        }

    }

    static moveJobOverlay(overlayObj, x, y) {
        var dx = x - overlayObj.lastpos.x;
        var dy = y - overlayObj.lastpos.y;
        for(var k in overlayObj) {
            if(k == 'lastpos') continue;
            overlayObj[k].translate(dx, dy);
        }
        overlayObj.lastpos.x = x;
        overlayObj.lastpos.y = y;
    }

    getExecutedActivitiesStr() {
        var eas = '';
        for(var j=0; j<this.numJobs; j++)
            if(this.sts[j] != -1)
                eas += (j+1) + ', ';
        return eas.substring(0, eas.length-2);
    }

    getNotExecutedActivitiesStr() {
        var neas = '';
        for(var j=0; j<this.numJobs; j++)
            if(this.sts[j] == -1)
                neas += (j+1) + ', ';
        return neas.substring(0, neas.length-2);
    }

    hideOverlays() {
        for(let j in this.overlayObjects) {
            for(let k in this.overlayObjects[j]) {
                if(k == 'lastpos') continue;
                this.overlayObjects[j][k].hide();
            }
        }
        this.greyRect.hide();
    }

    showOverlay(paper, o) {
        this.greyRect.show();
        for(let k in o) {
            if(k == 'lastpos') continue;
            o[k].show();
        }
    }

    getAttributesStr(paper, attrs) {
        var capr = this.capacities[this.selectedResource];
        var attrStr = '';
        for(var key in attrs) {
            if(key === 'executedActivities' || key === 'notExecutedActivities') continue;
            attrStr += key + '=' + attrs[key] + ', ';
        }
        attrStr = attrStr.substr(0, attrStr.length-2);
        paper.text(this.origin.x + 600, this.origin.y - (capr + 1.5) * this.scale, attrStr).attr('font-size', 15);
    }
}

class Attributes {
    constructor(sd, objectiveData) {
        this.data = {
            'makespan': sd.getMakespan(),
            'executedActivities': sd.getExecutedActivitiesStr(),
            'notExecutedActivities': sd.getNotExecutedActivitiesStr(),
            'profit': objectiveData.objval,
            'revenue': objectiveData.objval+objectiveData.costs,
            'costs': objectiveData.costs,
            'qlevelreached': qlevel_captions[objectiveData.qlevelfinish-1],
            'attrlevel1': objectiveData.attrlevel0,
            'attrlevel2': objectiveData.attrlevel1
        };
    }

    fillTable() {
        var attrs = this.data;
        $('#makespan').html(attrs.makespan);
        $('#executed').html(attrs.executedActivities);
        $('#not-executed').html(attrs.notExecutedActivities);
        $('#profit').html(attrs.profit);
        $('#costs').html(attrs.costs);
        $('#qlevelreached').html(attrs.qlevelreached);
        $('#qattr0').html(attrs.attrlevel1);
        $('#qattr1').html(attrs.attrlevel2);
    }
}

var main = function(obj, objectiveData, palette) {
    var sd = new ScheduleData(obj, palette);
    var paper = Raphael(document.getElementById('area'), sd.targetWidth(), sd.targetHeight());

    var attrs = new Attributes(sd, objectiveData);

    sd.draw(paper, attrs.data);
    attrs.fillTable();

    $('#resource-select').html(sd.getResourceOptionStr()).change(function() {
        if(sd.changeResource(parseInt($('#resource-select').val().replace('Resource ', '')) - 1))
            sd.draw(paper);
    });

    var hoverBefore = true;
    $('#area').mousemove(function(event) {
        var offset = $(this).offset();
        var mousePos = new Vec2(event.pageX - offset.left, event.pageY - offset.top);
        var hoveringOverJob = sd.checkJobHovering(mousePos);
        if(hoveringOverJob !== undefined) {
            var o = sd.getJobOverlay(paper, mousePos, hoveringOverJob);
            sd.hideOverlays();
            sd.showOverlay(paper, o);
            ScheduleData.moveJobOverlay(o, mousePos.x, mousePos.y);
            hoverBefore = true;
        } else if(hoverBefore) {
            hoverBefore = false;
            sd.hideOverlays();
        }
    }).mouseleave(function(event) {
        sd.hideOverlays();
    });
    return sd;
};

var runAfterLoad = function(contents, contents2, contents3) {
    var gmsOutObj = Parsing.gamsOutputLinesToObject(contents.match(/[^\r\n]+/g));
    var sd = main(gmsOutObj, Parsing.parseObjectives(contents2), Parsing.loadPalette(contents3));
    PDFJS.getDocument('forgviz.pdf').then(function(pdf) {
        pdf.getPage(1).then(function(page) {
            var desiredWidth = 640;
            var viewport = page.getViewport(1);
            var scale = desiredWidth / viewport.width;
            var scaledViewport = page.getViewport(scale);

            var canvas = document.getElementById('the-canvas');
            var context = canvas.getContext('2d');
            canvas.height = scaledViewport.height;
            canvas.width = scaledViewport.width;

            var renderContext = {
                canvasContext: context,
                viewport: scaledViewport
            };
            page.render(renderContext);
        });
    });
};

$(document).ready(function () {
    Helpers.batchGet(['ergebnisse.txt', 'zielwerte.txt', 'jobcolors.txt'], runAfterLoad);
    $('#togglebtn').click(function(event) { $('#attrtable').toggle(); return false; });
});