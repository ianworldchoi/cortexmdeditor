import type { Block } from '@shared/types'

/**
 * Numbering result for a block
 */
export interface NumberingResult {
    /** The display string (e.g., "1", "a", "iii") */
    display: string
    /** The depth/indent level */
    depth: number
    /** The counter value at this depth */
    counter: number
}

/**
 * Convert a number to alphabetic format (1 -> a, 26 -> z, 27 -> aa)
 */
function toAlpha(num: number): string {
    let result = ''
    let n = num

    while (n > 0) {
        const remainder = (n - 1) % 26
        result = String.fromCharCode(97 + remainder) + result // 97 is 'a'
        n = Math.floor((n - 1) / 26)
    }

    return result
}

/**
 * Convert a number to lowercase roman numerals
 */
function toRoman(num: number): string {
    const romanNumerals: [number, string][] = [
        [1000, 'm'],
        [900, 'cm'],
        [500, 'd'],
        [400, 'cd'],
        [100, 'c'],
        [90, 'xc'],
        [50, 'l'],
        [40, 'xl'],
        [10, 'x'],
        [9, 'ix'],
        [5, 'v'],
        [4, 'iv'],
        [1, 'i']
    ]

    let result = ''
    let remaining = num

    for (const [value, numeral] of romanNumerals) {
        while (remaining >= value) {
            result += numeral
            remaining -= value
        }
    }

    return result
}

/**
 * Format a counter value based on depth
 * - Depth 0: numbers (1, 2, 3, ...)
 * - Depth 1: lowercase letters (a, b, c, ...)
 * - Depth 2: lowercase roman numerals (i, ii, iii, ...)
 * - Depth 3+: numbers again
 */
function formatNumber(counter: number, depth: number): string {
    const normalizedDepth = depth % 3 // Cycle through 0, 1, 2

    switch (normalizedDepth) {
        case 0:
            return counter.toString()
        case 1:
            return toAlpha(counter)
        case 2:
            return toRoman(counter)
        default:
            return counter.toString()
    }
}

/**
 * Calculate the numbering for a specific block in the context of all blocks
 * 
 * This function:
 * 1. Tracks separate counters for each indent level
 * 2. Increments the counter when a numbered block at that level is found
 * 3. Resets deeper level counters when indent decreases
 * 
 * @param blocks - All blocks in the document
 * @param targetBlockId - The block ID to calculate numbering for
 * @returns Numbering information or null if block is not numbered
 */
export function getNumberingForBlock(
    blocks: Block[],
    targetBlockId: string
): NumberingResult | null {
    // Find the target block
    const targetIndex = blocks.findIndex(b => b.block_id === targetBlockId)
    if (targetIndex === -1) return null

    const targetBlock = blocks[targetIndex]
    if (targetBlock.type !== 'numbered') return null

    const targetDepth = targetBlock.indent || 0

    // Track counters for each depth level
    const counters: Map<number, number> = new Map()

    // Initialize counters
    for (let i = 0; i <= targetDepth; i++) {
        counters.set(i, 0)
    }

    // Iterate through blocks up to and including the target
    for (let i = 0; i <= targetIndex; i++) {
        const block = blocks[i]

        if (block.type !== 'numbered') continue

        const currentDepth = block.indent || 0

        // Reset deeper level counters when we encounter a shallower depth
        for (let d = currentDepth + 1; d <= Math.max(...Array.from(counters.keys())); d++) {
            counters.set(d, 0)
        }

        // Increment counter for this depth
        const currentCounter = (counters.get(currentDepth) || 0) + 1
        counters.set(currentDepth, currentCounter)
    }

    const counter = counters.get(targetDepth) || 1

    return {
        display: formatNumber(counter, targetDepth),
        depth: targetDepth,
        counter
    }
}
