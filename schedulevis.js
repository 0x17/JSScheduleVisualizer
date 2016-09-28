/**
 * Created by a.schnabel on 26.09.2016.
 */

$(document).ready(function () {
    var exampleScheduleData = {
        'durations': [0, 4, 2, 2, 5, 0],
        'capacities': [8, 4],
        'demands': [[0, 0, 2, 2, 1, 0], [0, 1, 1, 0, 1, 0]],
        'sts': [0, 0, 4, 6, 2, 8]
    };

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

    class Helpers {
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

        static drawRect(paper, rect, text, fillcolor = '#ff0', bordercolor = '#000', textcolor = '#000') {
            var rectangle = paper.rect(rect.x, rect.y - rect.h, rect.w, rect.h);
            rectangle.attr('fill', fillcolor);
            rectangle.attr('stroke', bordercolor);
            var centerPos = new Vec2(rect.x + rect.w / 2.0, rect.y - rect.h / 2.0);
            var txt = paper.text(centerPos.x, centerPos.y, text);
            txt.attr('font-size', 22);
            txt.attr('fill', textcolor);
            return [rectangle, txt];
        }

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

        static drawLine(paper, base, offset) {
            var pth = paper.path('M' + base.x + ',' + base.y + 'L' + (base.x + offset.x) + ',' + (base.y + offset.y));
            pth.attr('stroke', '#000');
            pth.attr('stroke-width', 2);
            return pth;
        }

        static drawArrow(paper, base, offset) {
            return Helpers.drawLine(paper, base, offset).attr('arrow-end', 'classic-wide-long');
        }

    }

    class ScheduleData {
        constructor(data) {
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
            this.computePalette();

            this.recomputeRects = true;
        }

        getDemand(j, r) {
            return this.demands[r][j];
        }

        ft(j) { return this.sts[j] + this.durations[j]; }

        drawQuad(paper, j, rcolors, xOffset, yOffset) {
            var rgeometry = new Rectangle(this.origin.x + xOffset, this.origin.y + yOffset, this.scale, this.scale);
            Helpers.drawRect(paper, rgeometry, j, rcolors.rectcolor, '#000', rcolors.textcolor);
            if(this.recomputeRects) {
                this.jobRects[j].push(new Rectangle(rgeometry.x, rgeometry.y-rgeometry.h, rgeometry.w, rgeometry.h));
            }
        }

        drawAxes(paper) {
            Helpers.drawArrow(paper, this.origin, new Vec2((this.numPeriods +1) * this.scale, 0));
            paper.text(this.origin.x + (this.numPeriods + 2) * this.scale, this.origin.y, 'Time').attr('font-size', 22);
            for(let t = 0; t <= this.numPeriods; t++) {
                Helpers.drawLine(paper, new Vec2(this.origin.x + t * this.scale, this.origin.y), new Vec2(0, this.scale));
                if(t < this.numPeriods) {
                    var boxCenter = new Vec2(this.origin.x + (t + 0.5) * this.scale, this.origin.y + this.scale * 0.5);
                    paper.text(boxCenter.x, boxCenter.y, (t+1)).attr('font-size', 22);
                }
            }

            var capr = this.capacities[this.selectedResource];

            Helpers.drawArrow(paper, this.origin, new Vec2(0, -(capr+1) * this.scale));
            paper.text(this.origin.x, this.origin.y - (capr + 1.5) * this.scale, 'Resource '+(this.selectedResource+1)).attr('font-size', 22);

            for(let k = 0; k <= capr; k++) {
                Helpers.drawLine(paper, new Vec2(this.origin.x - this.scale, this.origin.y - this.scale * k), new Vec2(this.scale, 0));
            }
            paper.text(this.origin.x - this.scale * 1.5, this.origin.y - this.scale * capr, 'Kr').attr('font-size', 22);

            Helpers.drawLine(paper, new Vec2(this.origin.x, this.origin.y - capr * this.scale), new Vec2((this.numPeriods +1) * this.scale, 0)).attr('stroke', 'red').attr('stroke-dasharray', '--');
        }

        computePalette() {
            this.rcolors = {};
            for(let j = 0; j< this.numJobs; j++) {
                this.rcolors[j] = Helpers.randomColors();
            }
        }

        draw(paper) {
            paper.clear();
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
                    if(this.sts[j] < t && t <= this.ft(j)) {
                        for(let c = 0; c < this.getDemand(j, this.selectedResource); c++) {
                            this.drawQuad(paper, j, this.rcolors[j], xOffset, yOffset);
                            yOffset -= this.scale;
                        }
                    }
                }
            }

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

        drawJobOverlay(paper, pos, jobId, opacityLevel = 0.95) {
            var r = new Rectangle(pos.x, pos.y, this.durations[jobId] * this.scale, this.getDemand(jobId, this.selectedResource) * this.scale);
            var pair = Helpers.drawRect(paper, r, jobId, this.rcolors[jobId].rectcolor, '#000', this.rcolors[jobId].textcolor);
            pair[0].attr('opacity', opacityLevel);
            pair[1].attr('opacity', opacityLevel);
            Helpers.drawArrow(paper, new Vec2(r.x, r.y+10), new Vec2(r.w, 0)).attr('opacity', opacityLevel);
            Helpers.drawArrow(paper, new Vec2(r.x-10, r.y), new Vec2(0, -r.h)).attr('opacity', opacityLevel);
            paper.text(r.x-30, r.y-r.h/2, 'k'+jobId+'='+this.getDemand(jobId, this.selectedResource)).attr('font-size', 15).attr('opacity', opacityLevel);
            paper.text(r.x+r.w/2, r.y+30, 'd'+jobId+'='+this.durations[jobId]).attr('font-size', 15).attr('opacity', opacityLevel);
        }
    }

    jQuery.get('ergebnisse.txt', function(contents) {
        var gmsOutObj = Helpers.gamsOutputLinesToObject(contents.match(/[^\r\n]+/g));
        var sd = new ScheduleData(gmsOutObj /*exampleScheduleData*/);
        var paper = Raphael(document.getElementById('area'), sd.targetWidth(), sd.targetHeight());
        sd.draw(paper);
        $('#resource-select').html(sd.getResourceOptionStr()).change(function() {
            if(sd.changeResource(parseInt($('#resource-select').val().replace('Resource ', '')) - 1))
                sd.draw(paper);
        });
        $('#njobs').html(sd.numJobs);
        $('#nres').html(sd.numRes);
        $('#nperiods').html(sd.numPeriods);
        $('#makespan').html(sd.getMakespan());
        var hoverBefore = true;
        $('#area').mousemove(function(event) {
            var offset = $(this).offset();
            var mousePos = new Vec2(event.pageX - offset.left, event.pageY - offset.top);
            var hoveringOverJob = sd.checkJobHovering(mousePos);
            if(hoveringOverJob !== undefined) {
                paper.clear();
                sd.draw(paper);
                paper.rect(0, 0, sd.targetWidth(), sd.targetHeight()).attr('fill', '#ccc').attr('opacity', 0.5);
                sd.drawJobOverlay(paper, mousePos, hoveringOverJob);
                hoverBefore = true;
            } else if(hoverBefore) {
                hoverBefore = false;
                paper.clear();
                sd.draw(paper);
            }
        });
    });

});