/* global d3, Colorizer, LabelFormatter, Navigator, Utils */
/* exported D3Funnel */

class D3Funnel {

	static defaults = {
		chart: {
			width: 350,
			height: 400,
			bottomWidth: 1 / 3,
			bottomPinch: 0,
			inverted: false,
			animate: false,
			curve: {
				enabled: false,
				height: 20,
			},
			showBorder: false,
			borderColor: '#666666',
			borderThickness: 4,
			borderAlpha: 100,
			margin: {
				top: 0,
				right: 0,
				bottom: 0,
				left: 0,
			},
			bgColor: 'none',
		},
		block: {
			dynamicHeight: false,
			fill: {
				scale: d3.scale.category10().domain(d3.range(0, 10)),
				type: 'solid',
			},
			minHeight: false,
			highlight: false,
		},
		label: {
			fontSize: '14px',
			fill: '#fff',
			format: '{l}: {f}',
		},
		events: {
			click: {
				block: null,
			},
		},
	};

	/**
	 * @param {string} selector A selector for the container element.
	 *
	 * @return {void}
	 */
	constructor(selector) {
		this.selector = selector;

		this.colorizer = new Colorizer();

		this.labelFormatter = new LabelFormatter();

		this.navigator = new Navigator();
	}

	/**
	 * Remove the funnel and its events from the DOM.
	 *
	 * @return {void}
	 */
	destroy() {
		// D3's remove method appears to be sufficient for removing the events
		d3.select(this.selector).selectAll('svg').remove();
	}

	/**
	 * Draw the chart inside the container with the data and configuration
	 * specified. This will remove any previous SVG elements in the container
	 * and draw a new funnel chart on top of it.
	 *
	 * @param {Array}  data    A list of rows containing a category, a count,
	 *                         and optionally a color (in hex).
	 * @param {Object} options An optional configuration object to override
	 *                         defaults. See the docs.
	 *
	 * @return {void}
	 */
	draw(data, options = {}) {
		this.destroy();

		this._initialize(data, options);

		this._draw();
	}

	/**
	 * Initialize and calculate important variables for drawing the chart.
	 *
	 * @param {Array}  data
	 * @param {Object} options
	 *
	 * @return {void}
	 */
	_initialize(data, options) {
		this._validateData(data);

		let settings = this._getSettings(options);

		// Set labels
		this.label = settings.label;
		this.labelFormatter.setFormat(this.label.format);

		// Set color scales
		this.colorizer.setLabelFill(settings.label.fill);
		this.colorizer.setScale(settings.block.fill.scale);

		// Initialize funnel chart settings
		this.bottomWidth = settings.chart.width * settings.chart.bottomWidth;
		this.bottomPinch = settings.chart.bottomPinch;
		this.isInverted = settings.chart.inverted;
		this.isCurved = settings.chart.curve.enabled;
		this.curveHeight = settings.chart.curve.height;
		this.fillType = settings.block.fill.type;
		this.hoverEffects = settings.block.highlight;
		this.dynamicHeight = settings.block.dynamicHeight;
		this.minHeight = settings.block.minHeight;
		this.animation = settings.chart.animate;
		this.showBorder = settings.chart.showBorder;
		this.borderColor = settings.chart.borderColor;
		this.borderThickness = settings.chart.borderThickness;
		this.borderAlpha = settings.chart.borderAlpha;
		this.margin = settings.chart.margin;
		this.width = settings.chart.width - this.margin.left - this.margin.right;
		this.height = settings.chart.height - this.margin.top - this.margin.bottom;
		this.bgColor = settings.chart.bgColor;

		// Support for events
		this.onBlockClick = settings.events.click.block;

		this._setBlocks(data);

		// Calculate the bottom left x position
		this.bottomLeftX = (this.width - this.bottomWidth) / 2;

		// Change in x direction
		this.dx = this._getDx();

		// Change in y direction
		this.dy = this._getDy();
	}

	/**
	 * @param {Array} data
	 *
	 * @return void
	 */
	_validateData(data) {
		if (Array.isArray(data) === false ||
			data.length === 0 ||
			Array.isArray(data[0]) === false ||
			data[0].length < 2) {
			throw new Error('Funnel data is not valid.');
		}
	}

	/**
	 * @param {Object} options
	 *
	 * @returns {Object}
	 */
	_getSettings(options) {
		// Prepare the configuration settings based on the defaults
		// Set the default width and height based on the container
		let settings = Utils.extend({}, D3Funnel.defaults);
		settings.chart.width = parseInt(d3.select(this.selector).style('width'), 10);
		settings.chart.height = parseInt(d3.select(this.selector).style('height'), 10);

		// Overwrite default settings with user options
		settings = Utils.extend(settings, options);

		// In the case that the width or height is not valid, set
		// the width/height as its default hard-coded value
		if (settings.chart.width <= 0) {
			settings.chart.width = D3Funnel.defaults.chart.width;
		}
		if (settings.chart.height <= 0) {
			settings.chart.height = D3Funnel.defaults.chart.height;
		}

		return settings;
	}

	/**
	 * Register the raw data into a standard block format and pre-calculate
	 * some values.
	 *
	 * @param {Array} data
	 *
	 * @return void
	 */
	_setBlocks(data) {
		let totalCount = this._getTotalCount(data);

		this.blocks = this._standardizeData(data, totalCount);
	}

	/**
	 * Return the total count of all blocks.
	 *
	 * @return {Number}
	 */
	_getTotalCount(data) {
		let total = 0;

		data.forEach((block) => {
			total += this._getRawBlockCount(block);
		});

		return total;
	}

	/**
	 * Convert the raw data into a standardized format.
	 *
	 * @param {Array}  data
	 * @param {Number} totalCount
	 *
	 * @return {Array}
	 */
	_standardizeData(data, totalCount) {
		let standardized = [];

		let count;
		let ratio;
		let label;

		data.forEach((block, index) => {
			count = this._getRawBlockCount(block);
			ratio = count / totalCount;
			label = block[0];

			standardized.push({
				index: index,
				value: count,
				ratio: ratio,
				height: this.height * ratio,
				formatted: this.labelFormatter.format(label, count),
				fill: this.colorizer.getBlockFill(block, index),
				label: {
					raw: label,
					formatted: this.labelFormatter.format(label, count),
					color: this.colorizer.getLabelFill(block, index),
				},
			});
		});

		return standardized;
	}

	/**
	 * Given a raw data block, return its count.
	 *
	 * @param {Array} block
	 *
	 * @return {Number}
	 */
	_getRawBlockCount(block) {
		return Array.isArray(block[1]) ? block[1][0] : block[1];
	}

	/**
	 * @return {Number}
	 */
	_getDx() {
		// Will be sharper if there is a pinch
		if (this.bottomPinch > 0) {
			return this.bottomLeftX / (this.blocks.length - this.bottomPinch);
		}

		return this.bottomLeftX / this.blocks.length;
	}

	/**
	 * @return {Number}
	 */
	_getDy() {
		// Curved chart needs reserved pixels to account for curvature
		if (this.isCurved) {
			return (this.height - this.curveHeight) / this.blocks.length;
		}

		return this.height / this.blocks.length;
	}

	/**
	 * Draw the chart onto the DOM.
	 *
	 * @return {void}
	 */
	_draw() {
		// Add the SVG
		this.svg = d3.select(this.selector)
			.append('svg')
			.attr('width', this.width + this.margin.left + this.margin.right)
			.attr('height', this.height + this.margin.top + this.margin.bottom);

		if (this.showBorder && this.bgColor !== 'none') {
			this._showBorder(this.svg);
		}else {
			if (this.showBorder) {
				this._showBorder(this.svg);
			}
			if (this.bgColor !== 'none') {
				this._bgColor(this.svg);
			}
		}

		this.svg = this.svg.append('g')
			.attr('transform', 'translate(' + this.margin.left + ',' + this.margin.top + ')');

		this.blockPaths = this._makePaths();

		// Define color gradients
		if (this.fillType === 'gradient') {
			this._defineColorGradients(this.svg);
		}

		// Add top oval if curved
		if (this.isCurved) {
			this._drawTopOval(this.svg, this.blockPaths);
		}

		// Add each block
		this._drawBlock(0);
	}

	/**
	 * Create the paths to be used to define the discrete funnel blocks and
	 * returns the results in an array.
	 *
	 * @return {Array}
	 */
	_makePaths() {
		let paths = [];

		// Initialize velocity
		let dx = this.dx;
		let dy = this.dy;

		// Initialize starting positions
		let prevLeftX = 0;
		let prevRightX = this.width;
		let prevHeight = 0;

		// Start from the bottom for inverted
		if (this.isInverted) {
			prevLeftX = this.bottomLeftX;
			prevRightX = this.width - this.bottomLeftX;
		}

		// Initialize next positions
		let nextLeftX = 0;
		let nextRightX = 0;
		let nextHeight = 0;

		let middle = this.width / 2;

		// Move down if there is an initial curve
		if (this.isCurved) {
			prevHeight = 10;
		}

		let totalHeight = this.height;

		// This is greedy in that the block will have a guaranteed height
		// and the remaining is shared among the ratio, instead of being
		// shared according to the remaining minus the guaranteed
		if (this.minHeight !== false) {
			totalHeight = this.height - this.minHeight * this.blocks.length;
		}

		let slopeHeight = this.height;

		// Correct slope height if there are blocks being pinched (and thus
		// requiring a sharper curve)
		this.blocks.forEach((block, i) => {
			if (this.bottomPinch > 0) {
				if (this.isInverted) {
					if (i < this.bottomPinch) {
						slopeHeight -= block.height;
					}
				} else if (i >= this.blocks.length - this.bottomPinch) {
					slopeHeight -= block.height;
				}
			}
		});

		// The slope will determine the where the x points on each block
		// iteration
		let slope = 2 * slopeHeight / (this.width - this.bottomWidth);

		// Create the path definition for each funnel block
		// Remember to loop back to the beginning point for a closed path
		this.blocks.forEach((block, i) => {
			// Make heights proportional to block weight
			if (this.dynamicHeight) {
				// Slice off the height proportional to this block
				dy = totalHeight * block.ratio;

				// Add greedy minimum height
				if (this.minHeight !== false) {
					dy += this.minHeight;
				}

				// Account for any curvature
				if (this.isCurved) {
					dy = dy - (this.curveHeight / this.blocks.length);
				}

				// Given: y = mx + b
				// Given: b = 0 (when funnel), b = this.height (when pyramid)
				// For funnel, x_i = y_i / slope
				nextLeftX = (prevHeight + dy) / slope;

				// For pyramid, x_i = y_i - this.height / -slope
				if (this.isInverted) {
					nextLeftX = (prevHeight + dy - this.height) / (-1 * slope);
				}

				// If bottomWidth is 0, adjust last x position (to circumvent
				// errors associated with rounding)
				if (this.bottomWidth === 0 && i === this.blocks.length - 1) {
					// For funnel, last position is the center
					nextLeftX = this.width / 2;

					// For pyramid, last position is the origin
					if (this.isInverted) {
						nextLeftX = 0;
					}
				}

				// If bottomWidth is same as width, stop x velocity
				if (this.bottomWidth === this.width) {
					nextLeftX = prevLeftX;
				}

				// Calculate the shift necessary for both x points
				dx = nextLeftX - prevLeftX;

				if (this.isInverted) {
					dx = prevLeftX - nextLeftX;
				}
			}

			// Stop velocity for pinched blocks
			if (this.bottomPinch > 0) {
				// Check if we've reached the bottom of the pinch
				// If so, stop changing on x
				if (!this.isInverted) {
					if (i >= this.blocks.length - this.bottomPinch) {
						dx = 0;
					}
					// Pinch at the first blocks relating to the bottom pinch
					// Revert back to normal velocity after pinch
				} else {
					// Revert velocity back to the initial if we are using
					// static area's (prevents zero velocity if isInverted
					// and bottomPinch are non trivial and dynamicHeight is
					// false)
					if (!this.dynamicHeight) {
						dx = this.dx;
					}

					dx = i < this.bottomPinch ? 0 : dx;
				}
			}

			// Calculate the position of next block
			nextLeftX = prevLeftX + dx;
			nextRightX = prevRightX - dx;
			nextHeight = prevHeight + dy;

			// Expand outward if inverted
			if (this.isInverted) {
				nextLeftX = prevLeftX - dx;
				nextRightX = prevRightX + dx;
			}

			// Plot curved lines
			if (this.isCurved) {
				paths.push([
					// Top Bezier curve
					[prevLeftX, prevHeight, 'M'],
					[middle, prevHeight + (this.curveHeight - 10), 'Q'],
					[prevRightX, prevHeight, ''],
					// Right line
					[nextRightX, nextHeight, 'L'],
					// Bottom Bezier curve
					[nextRightX, nextHeight, 'M'],
					[middle, nextHeight + this.curveHeight, 'Q'],
					[nextLeftX, nextHeight, ''],
					// Left line
					[prevLeftX, prevHeight, 'L'],
				]);
				// Plot straight lines
			} else {
				paths.push([
					// Start position
					[prevLeftX, prevHeight, 'M'],
					// Move to right
					[prevRightX, prevHeight, 'L'],
					// Move down
					[nextRightX, nextHeight, 'L'],
					// Move to left
					[nextLeftX, nextHeight, 'L'],
					// Wrap back to top
					[prevLeftX, prevHeight, 'L'],
				]);
			}

			// Set the next block's previous position
			prevLeftX = nextLeftX;
			prevRightX = nextRightX;
			prevHeight = nextHeight;
		});

		return paths;
	}

	/**
	 * Define the linear color gradients.
	 *
	 * @param {Object} svg
	 *
	 * @return {void}
	 */
	_defineColorGradients(svg) {
		let defs = svg.append('defs');

		// Create a gradient for each block
		this.blocks.forEach((block, index) => {
			let color = block.fill;
			let shade = Colorizer.shade(color, -0.25);

			// Create linear gradient
			let gradient = defs.append('linearGradient')
				.attr({
					id: 'gradient-' + index,
				});

			// Define the gradient stops
			let stops = [
				[0, shade],
				[40, color],
				[60, color],
				[100, shade],
			];

			// Add the gradient stops
			stops.forEach((stop) => {
				gradient.append('stop').attr({
					offset: stop[0] + '%',
					style: 'stop-color:' + stop[1],
				});
			});
		});
	}

	/**
	 * Draw the top oval of a curved funnel.
	 *
	 * @param {Object} svg
	 * @param {Array}  blockPaths
	 *
	 * @return {void}
	 */
	_drawTopOval(svg, blockPaths) {
		let leftX = 0;
		let rightX = this.width;
		let centerX = this.width / 2;

		if (this.isInverted) {
			leftX = this.bottomLeftX;
			rightX = this.width - this.bottomLeftX;
		}

		// Create path from top-most block
		let paths = blockPaths[0];
		let topCurve = paths[1][1] + this.curveHeight - 10;

		let path = this.navigator.plot([
			['M', leftX, paths[0][1]],
			['Q', centerX, topCurve],
			[' ', rightX, paths[2][1]],
			['M', rightX, 10],
			['Q', centerX, 0],
			[' ', leftX, 10],
		]);

		// Draw top oval
		svg.append('path')
			.attr('fill', Colorizer.shade(this.blocks[0].fill, -0.4))
			.attr('d', path);
	}

	/**
	 * Draw the next block in the iteration.
	 *
	 * @param {int} index
	 *
	 * @return {void}
	 */
	_drawBlock(index) {
		if (index === this.blocks.length) {
			return;
		}

		// Create a group just for this block
		let group = this.svg.append('g');

		// Fetch path element
		let path = this._getBlockPath(group, index);
		path.data(this._getD3Data(index));

		// Add animation components
		if (this.animation !== false) {
			path.transition()
				.duration(this.animation)
				.ease('linear')
				.attr('fill', this._getFillColor(index))
				.attr('d', this._getPathDefinition(index))
				.each('end', () => {
					this._drawBlock(index + 1);
				});
		} else {
			path.attr('fill', this._getFillColor(index))
				.attr('d', this._getPathDefinition(index));
			this._drawBlock(index + 1);
		}

		// Add the hover events
		if (this.hoverEffects) {
			path.on('mouseover', this._onMouseOver)
				.on('mouseout', this._onMouseOut);
		}

		// ItemClick event
		if (this.onBlockClick !== null) {
			path.on('click', this.onBlockClick);
		}

		this._addBlockLabel(group, index);
	}

	/**
	 * @param {Object} group
	 * @param {int}    index
	 *
	 * @return {Object}
	 */
	_getBlockPath(group, index) {
		let path = group.append('path');

		if (this.animation !== false) {
			this._addBeforeTransition(path, index);
		}

		return path;
	}

	/**
	 * Set the attributes of a path element before its animation.
	 *
	 * @param {Object} path
	 * @param {int}    index
	 *
	 * @return {void}
	 */
	_addBeforeTransition(path, index) {
		let paths = this.blockPaths[index];

		let beforePath = '';
		let beforeFill = '';

		// Construct the top of the trapezoid and leave the other elements
		// hovering around to expand downward on animation
		if (!this.isCurved) {
			beforePath = this.navigator.plot([
				['M', paths[0][0], paths[0][1]],
				['L', paths[1][0], paths[1][1]],
				['L', paths[1][0], paths[1][1]],
				['L', paths[0][0], paths[0][1]],
			]);
		} else {
			beforePath = this.navigator.plot([
				['M', paths[0][0], paths[0][1]],
				['Q', paths[1][0], paths[1][1]],
				[' ', paths[2][0], paths[2][1]],
				['L', paths[2][0], paths[2][1]],
				['M', paths[2][0], paths[2][1]],
				['Q', paths[1][0], paths[1][1]],
				[' ', paths[0][0], paths[0][1]],
			]);
		}

		// Use previous fill color, if available
		if (this.fillType === 'solid' && index > 0) {
			beforeFill = this._getFillColor(index - 1);
		// Otherwise use current background
		} else {
			beforeFill = this._getFillColor(index);
		}

		path.attr('d', beforePath)
			.attr('fill', beforeFill);
	}

	/**
	 * Return d3 formatted data for the given block.
	 *
	 * @param {int} index
	 *
	 * @return {Array}
	 */
	_getD3Data(index) {
		return [this.blocks[index]];
	}

	/**
	 * Return the block fill color for the given index.
	 *
	 * @param {int} index
	 *
	 * @return {string}
	 */
	_getFillColor(index) {
		if (this.fillType === 'solid') {
			return this.blocks[index].fill;
		}

		return 'url(#gradient-' + index + ')';
	}

	/**
	 * @param {int} index
	 *
	 * @return {string}
	 */
	_getPathDefinition(index) {
		let commands = [];

		this.blockPaths[index].forEach((command) => {
			commands.push([command[2], command[0], command[1]]);
		});

		return this.navigator.plot(commands);
	}

	/**
	 * @param {Object} data
	 *
	 * @return {void}
	 */
	_onMouseOver(data) {
		d3.select(this).attr('fill', Colorizer.shade(data.fill, -0.2));
	}

	/**
	 * @param {Object} data
	 *
	 * @return {void}
	 */
	_onMouseOut(data) {
		d3.select(this).attr('fill', data.fill);
	}

	/**
	 * @param {Object} group
	 * @param {int}    index
	 *
	 * @return {void}
	 */
	_addBlockLabel(group, index) {
		let paths = this.blockPaths[index];

		let text = this.blocks[index].label.formatted;
		let fill = this.blocks[index].label.color;

		let x = this.width / 2;  // Center the text
		let y = this._getTextY(paths);

		group.append('text')
			.text(text)
			.attr({
				'x': x,
				'y': y,
				'text-anchor': 'middle',
				'dominant-baseline': 'middle',
				'fill': fill,
				'pointer-events': 'none',
			})
			.style('font-size', this.label.fontSize);
	}

	/**
	 * Returns the y position of the given label's text. This is determined by
	 * taking the mean of the bases.
	 *
	 * @param {Array} paths
	 *
	 * @return {Number}
	 */
	_getTextY(paths) {
		if (this.isCurved) {
			return (paths[2][1] + paths[3][1]) / 2 + (this.curveHeight / this.blocks.length);
		}

		return (paths[1][1] + paths[2][1]) / 2;
	}

	/**
	 * Define the border for svg canvas.
	 *
	 * @param {Object} svg
	 *
	 * @return {void}
	 */
	_showBorder(svg) {
		svg.attr('border', 1)
			.append('rect')
			.attr('x', 0)
			.attr('y', 0)
			.attr('height', this.height + this.margin.top + this.margin.bottom)
			.attr('width', this.width + this.margin.left + this.margin.right)
			.style('fill', this.bgColor)
			.style('stroke', this.borderColor)
			.style('stroke-width', this.borderThickness)
			.style('stroke-opacity', (this.borderAlpha / 100));
	}

	_bgColor(svg) {
		svg.append('rect')
			.attr('x', 0)
			.attr('y', 0)
			.attr('height', this.height + this.margin.top + this.margin.bottom)
			.attr('width', this.width + this.margin.left + this.margin.right)
			.style('fill', this.bgColor);
	}
}
