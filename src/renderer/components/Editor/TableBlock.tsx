import { useState, useRef, useCallback, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { TableCell } from '@shared/types'

interface TableBlockProps {
    tableData: TableCell[][]
    onChange: (data: TableCell[][]) => void
    viewMode: 'edit' | 'preview'
}

export default function TableBlock({ tableData, onChange, viewMode }: TableBlockProps) {
    const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(null)
    const [hoveredRow, setHoveredRow] = useState<number | null>(null)
    const [hoveredCol, setHoveredCol] = useState<number | null>(null)
    const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map())

    const rows = tableData.length
    const cols = tableData[0]?.length || 0

    // Cell editing
    const handleCellChange = useCallback((rowIndex: number, colIndex: number, content: string) => {
        const newData = tableData.map((row, rIdx) =>
            row.map((cell, cIdx) =>
                rIdx === rowIndex && cIdx === colIndex
                    ? { content }
                    : cell
            )
        )
        onChange(newData)
    }, [tableData, onChange])

    // Navigation with Tab/Enter
    const handleKeyDown = useCallback((e: React.KeyboardEvent, rowIndex: number, colIndex: number) => {
        if (e.key === 'Tab') {
            e.preventDefault()
            const nextCol = e.shiftKey ? colIndex - 1 : colIndex + 1

            if (nextCol >= 0 && nextCol < cols) {
                setActiveCell({ row: rowIndex, col: nextCol })
                const ref = cellRefs.current.get(`${rowIndex}-${nextCol}`)
                ref?.focus()
            } else if (!e.shiftKey && nextCol >= cols && rowIndex < rows - 1) {
                // Move to next row
                setActiveCell({ row: rowIndex + 1, col: 0 })
                const ref = cellRefs.current.get(`${rowIndex + 1}-0`)
                ref?.focus()
            } else if (e.shiftKey && nextCol < 0 && rowIndex > 0) {
                // Move to prev row
                setActiveCell({ row: rowIndex - 1, col: cols - 1 })
                const ref = cellRefs.current.get(`${rowIndex - 1}-${cols - 1}`)
                ref?.focus()
            }
        } else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            if (rowIndex < rows - 1) {
                setActiveCell({ row: rowIndex + 1, col: colIndex })
                const ref = cellRefs.current.get(`${rowIndex + 1}-${colIndex}`)
                ref?.focus()
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            if (rowIndex < rows - 1) {
                setActiveCell({ row: rowIndex + 1, col: colIndex })
                const ref = cellRefs.current.get(`${rowIndex + 1}-${colIndex}`)
                ref?.focus()
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            if (rowIndex > 0) {
                setActiveCell({ row: rowIndex - 1, col: colIndex })
                const ref = cellRefs.current.get(`${rowIndex - 1}-${colIndex}`)
                ref?.focus()
            }
        }
    }, [rows, cols])

    // Add row
    const addRow = useCallback((afterIndex?: number) => {
        const newRow: TableCell[] = Array(cols).fill(null).map(() => ({ content: '' }))
        const insertIndex = afterIndex !== undefined ? afterIndex + 1 : rows
        const newData = [
            ...tableData.slice(0, insertIndex),
            newRow,
            ...tableData.slice(insertIndex)
        ]
        onChange(newData)
    }, [tableData, cols, rows, onChange])

    // Add column
    const addColumn = useCallback((afterIndex?: number) => {
        const insertIndex = afterIndex !== undefined ? afterIndex + 1 : cols
        const newData = tableData.map(row => [
            ...row.slice(0, insertIndex),
            { content: '' },
            ...row.slice(insertIndex)
        ])
        onChange(newData)
    }, [tableData, cols, onChange])

    // Delete row
    const deleteRow = useCallback((rowIndex: number) => {
        if (rows <= 1) return // Keep at least one row
        const newData = tableData.filter((_, idx) => idx !== rowIndex)
        onChange(newData)
    }, [tableData, rows, onChange])

    // Delete column
    const deleteColumn = useCallback((colIndex: number) => {
        if (cols <= 1) return // Keep at least one column
        const newData = tableData.map(row => row.filter((_, idx) => idx !== colIndex))
        onChange(newData)
    }, [tableData, cols, onChange])

    // Register cell refs
    const registerCellRef = useCallback((key: string, el: HTMLDivElement | null) => {
        if (el) {
            cellRefs.current.set(key, el)
        } else {
            cellRefs.current.delete(key)
        }
    }, [])

    if (viewMode === 'preview') {
        return (
            <div className="table-block-preview">
                <table className="table-preview">
                    <thead>
                        <tr>
                            {tableData[0]?.map((cell, colIdx) => (
                                <th key={colIdx}>{cell.content || ''}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {tableData.slice(1).map((row, rowIdx) => (
                            <tr key={rowIdx}>
                                {row.map((cell, colIdx) => (
                                    <td key={colIdx}>{cell.content || ''}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )
    }

    return (
        <div className="table-block" onMouseLeave={() => { setHoveredRow(null); setHoveredCol(null) }}>
            {/* Column controls */}
            <div className="table-col-controls">
                <div className="table-col-spacer" />
                {tableData[0]?.map((_, colIdx) => (
                    <div
                        key={colIdx}
                        className="table-col-control"
                        onMouseEnter={() => setHoveredCol(colIdx)}
                    >
                        {hoveredCol === colIdx && (
                            <button
                                className="table-delete-btn"
                                onClick={() => deleteColumn(colIdx)}
                                title="Delete column"
                            >
                                <Trash2 size={12} />
                            </button>
                        )}
                    </div>
                ))}
                <button
                    className="table-add-col-btn"
                    onClick={() => addColumn()}
                    title="Add column"
                >
                    <Plus size={14} />
                </button>
            </div>

            {/* Table body */}
            <div className="table-body">
                {tableData.map((row, rowIdx) => (
                    <div
                        key={rowIdx}
                        className={`table-row ${rowIdx === 0 ? 'table-header-row' : ''}`}
                        onMouseEnter={() => setHoveredRow(rowIdx)}
                    >
                        {/* Row control */}
                        <div className="table-row-control">
                            {hoveredRow === rowIdx && rows > 1 && (
                                <button
                                    className="table-delete-btn"
                                    onClick={() => deleteRow(rowIdx)}
                                    title="Delete row"
                                >
                                    <Trash2 size={12} />
                                </button>
                            )}
                        </div>

                        {/* Cells */}
                        {row.map((cell, colIdx) => (
                            <div
                                key={colIdx}
                                ref={(el) => registerCellRef(`${rowIdx}-${colIdx}`, el)}
                                className={`table-cell ${activeCell?.row === rowIdx && activeCell?.col === colIdx ? 'active' : ''
                                    } ${rowIdx === 0 ? 'header-cell' : ''}`}
                                contentEditable
                                suppressContentEditableWarning
                                onFocus={() => setActiveCell({ row: rowIdx, col: colIdx })}
                                onBlur={(e) => {
                                    handleCellChange(rowIdx, colIdx, e.currentTarget.textContent || '')
                                }}
                                onKeyDown={(e) => handleKeyDown(e, rowIdx, colIdx)}
                                dangerouslySetInnerHTML={{ __html: cell.content }}
                            />
                        ))}
                    </div>
                ))}
            </div>

            {/* Add row button */}
            <button
                className="table-add-row-btn"
                onClick={() => addRow()}
            >
                <Plus size={14} />
                <span>Add row</span>
            </button>
        </div>
    )
}

// Default table data factory
export function createDefaultTableData(): TableCell[][] {
    return [
        [{ content: 'Header 1' }, { content: 'Header 2' }, { content: 'Header 3' }],
        [{ content: '' }, { content: '' }, { content: '' }],
        [{ content: '' }, { content: '' }, { content: '' }]
    ]
}
