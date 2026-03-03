const { wrapComment } = require('./general');

/**
 * @typedef {{
 *   annotationName?: string
 *   annotationValue?: string
 * }} Annotation
 */

/**
 * Generates annotations string.
 * @param {function} prepareName - Function to format/escape identifiers
 * @returns {(annotations: Annotation[]) => string} - returns Annotations string (e.g: "\nANNOTATIONS (...)") or ''.
 */
const getAnnotationsString = prepareName => annotations => {
	if (!Array.isArray(annotations) || annotations.length === 0) {
		return '';
	}

	const wrapValue = value => wrapComment(value);

	const annotationsItems = annotations
		.filter(annotation => annotation?.annotationName?.trim())
		.map(annotation => {
			const { annotationName, annotationValue } = annotation;
			const name = prepareName(annotationName.trim());

			let finalValue = '';

			if (annotationValue !== undefined && annotationValue.trim() !== '') {
				finalValue = ' ' + wrapValue(annotationValue.trim());
			}

			return `${name}${finalValue}`;
		});

	if (annotationsItems.length > 0) {
		return `ANNOTATIONS (${annotationsItems.join(', ')})`;
	}

	return '';
};

module.exports = { getAnnotationsString };
