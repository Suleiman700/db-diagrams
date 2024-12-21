class TableDiagram {
    constructor() {
        this.codeEditor = document.getElementById('codeEditor');
        this.diagram = document.getElementById('diagram');
        this.storage = new LocalStorage();
        this.tables = new Map();
        this.relationships = [];
        this.lines = [];
        this.scale = 1;
        this.updateTimeout = null;
        this.currentHighlight = null;
        this.tablePositions = new Map();
        this.isDraggingCanvas = false;
        this.lastX = 0;
        this.lastY = 0;
        this.canvasX = 0;
        this.canvasY = 0;
        this.lockedTables = new Set();

        // Load locked tables state
        const savedLocks = this.storage.getItem('lockedTables');
        if (savedLocks) {
            this.lockedTables = new Set(savedLocks);
        }

        // Initialize undo/redo functionality
        this.history = [];
        this.currentHistoryIndex = -1;
        this.maxHistorySize = 100;
        this.undoBtn = document.getElementById('undoBtn');
        this.redoBtn = document.getElementById('redoBtn');
        this.historyStatus = document.getElementById('historyStatus');
        
        // Initialize buttons
        this.undoBtn.addEventListener('click', () => this.undo());
        this.redoBtn.addEventListener('click', () => this.redo());
        
        // Add keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                this.undo();
            } else if (e.ctrlKey && e.key === 'y' || (e.ctrlKey && e.shiftKey && e.key === 'Z')) {
                e.preventDefault();
                this.redo();
            }
        });

        // Check for saved diagram
        const savedData = this.storage.getItem('diagram');
        if (savedData?.content) {
            Swal.fire({
                title: '<span class="text-xl font-bold">Restore Your Work</span>',
                html: `
                    <div class="p-4">
                        <i class="fas fa-file-code text-4xl text-blue-500 mb-4"></i>
                        <p class="text-gray-600 mt-2">We found a previously saved diagram.</p>
                        <p class="text-gray-600">Would you like to continue where you left off?</p>
                    </div>
                `,
                icon: null,
                showCancelButton: true,
                confirmButtonColor: '#3b82f6',
                cancelButtonColor: '#64748b',
                confirmButtonText: '<i class="fas fa-check mr-2"></i>Yes, restore it',
                cancelButtonText: '<i class="fas fa-times mr-2"></i>No, start fresh',
                customClass: {
                    popup: 'rounded-lg shadow-xl',
                    confirmButton: 'px-6 py-3 rounded-lg font-semibold',
                    cancelButton: 'px-6 py-3 rounded-lg font-semibold'
                },
                buttonsStyling: true,
                showClass: {
                    popup: 'animate__animated animate__fadeIn animate__faster'
                },
                hideClass: {
                    popup: 'animate__animated animate__fadeOut animate__faster'
                }
            }).then((result) => {
                if (result.isConfirmed) {
                    this.codeEditor.value = savedData.content;
                    if (savedData.positions) {
                        this.tablePositions = new Map(Object.entries(savedData.positions));
                    }
                    this.generateDiagram();
                    
                    Swal.fire({
                        title: '<span class="text-xl font-bold">Success!</span>',
                        html: `
                            <div class="p-4">
                                <i class="fas fa-check-circle text-4xl text-green-500 mb-4"></i>
                                <p class="text-gray-600">Your diagram has been restored.</p>
                            </div>
                        `,
                        icon: null,
                        timer: 1500,
                        showConfirmButton: false,
                        customClass: {
                            popup: 'rounded-lg shadow-xl'
                        },
                        showClass: {
                            popup: 'animate__animated animate__fadeIn animate__faster'
                        },
                        hideClass: {
                            popup: 'animate__animated animate__fadeOut animate__faster'
                        }
                    });
                }
            });
        }

        // Initialize zoom controls
        this.initZoomControls();
        
        // Initialize canvas dragging
        this.initCanvasDrag();

        // Initialize button controls
        this.initButtonControls();

        // Handle LeaderLine container
        this.setupLeaderLineContainer();

        // Add click handler to clear highlights when clicking outside tables
        this.diagram.addEventListener('click', (e) => {
            // Only clear if clicking directly on the diagram container, not on tables
            if (e.target === this.diagram) {
                this.clearHighlights();
                // Remove any highlight classes
                document.querySelectorAll('.highlight').forEach(el => {
                    el.classList.remove('highlight', 'bg-blue-100');
                });
            }
        });

        // Add input event for real-time updates
        this.codeEditor.addEventListener('input', () => {
            if (this.updateTimeout) {
                clearTimeout(this.updateTimeout);
            }
            this.updateTimeout = setTimeout(() => {
                this.addToHistory('text');
                this.storage.setItem('diagram', {
                    content: this.codeEditor.value,
                    positions: Object.fromEntries(this.tablePositions)
                });
                this.generateDiagram();
            }, 300);
        });

        // Generate diagram immediately on load
        this.generateDiagram();
    }

    initButtonControls() {
        // Reset Layout Button
        const resetLayoutBtn = document.getElementById('resetLayoutBtn');
        resetLayoutBtn.addEventListener('click', () => this.resetLayout());

        // Export Button and Dialog
        const exportBtn = document.getElementById('exportBtn');
        const exportDialog = document.getElementById('exportDialog');
        const exportSQL = document.getElementById('exportSQL');
        const exportImage = document.getElementById('exportImage');
        const closeExportDialog = document.getElementById('closeExportDialog');

        // Show dialog
        exportBtn.addEventListener('click', () => {
            exportDialog.classList.add('show');
        });

        // Close dialog handlers
        const closeDialog = () => exportDialog.classList.remove('show');
        
        closeExportDialog.addEventListener('click', closeDialog);
        exportDialog.addEventListener('click', (e) => {
            if (e.target === exportDialog) closeDialog();
        });

        // Export SQL
        exportSQL.addEventListener('click', () => {
            this.exportSQL();
            closeDialog();
        });

        // Export Image
        exportImage.addEventListener('click', () => {
            this.exportImage();
            closeDialog();
        });
    }

    resetLayout() {
        const padding = 30;
        const startX = padding;
        const startY = padding;

        // Reset all table positions with animation
        Array.from(this.tables.keys()).forEach((tableName, index) => {
            const tableEl = document.getElementById(`table-${tableName}`);
            if (tableEl) {
                tableEl.style.transition = 'transform 0.5s ease-in-out';
                const x = startX;
                const y = startY + (index * (tableEl.offsetHeight + padding));
                tableEl.style.transform = `translate(${x}px, ${y}px)`;
                this.saveTablePosition(tableName, x, y);
            }
        });

        // Update relationship lines after animation
        setTimeout(() => {
            this.drawRelationships();
            // Reset transitions
            Array.from(this.tables.keys()).forEach(tableName => {
                const tableEl = document.getElementById(`table-${tableName}`);
                if (tableEl) {
                    tableEl.style.transition = '';
                }
            });
        }, 500);
    }

    exportSQL() {
        let sql = '';
        
        // Generate CREATE TABLE statements
        this.tables.forEach((fields, tableName) => {
            sql += `CREATE TABLE ${tableName} (\n`;
            
            // Add fields
            const fieldDefs = [];
            fields.forEach(field => {
                let fieldDef = `  ${field.name} ${field.definition.replace(/\[.*?\]/g, '').trim()}`;
                
                // Add primary key
                if (field.isPK) {
                    fieldDef += ' PRIMARY KEY';
                }
                
                // Add auto increment for integer primary keys
                if (field.isPK && field.definition.replace(/\[.*?\]/g, '').trim().toLowerCase().includes('int')) {
                    fieldDef += ' AUTO_INCREMENT';
                }
                
                // Add not null constraint
                if (!field.hasError && !field.definition.includes('[null]')) {
                    fieldDef += ' NOT NULL';
                }
                
                fieldDefs.push(fieldDef);
            });
            
            // Add foreign key constraints
            fields.forEach(field => {
                if (field.isFK) {
                    const rel = this.relationships.find(r => 
                        (r.from === tableName && r.fromField === field.name) ||
                        (r.to === tableName && r.toField === field.name)
                    );
                    if (rel) {
                        fieldDefs.push(`  FOREIGN KEY (${field.name}) REFERENCES ${rel.to === tableName ? rel.from : rel.to}(${rel.to === tableName ? rel.fromField : rel.toField})`);
                    }
                }
            });
            
            sql += fieldDefs.join(',\n');
            sql += '\n);\n\n';
        });
        
        // Create download
        const blob = new Blob([sql], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'schema.sql';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }

    exportImage() {
        const diagram = document.querySelector('.diagram-container');
        
        // Temporarily hide the control buttons
        const controls = diagram.querySelector('.absolute.top-4.right-4');
        controls.style.display = 'none';
        
        // Draw the diagram content using html2canvas
        html2canvas(diagram, {
            backgroundColor: null,
            scale: 2, // Higher quality
            logging: false,
            onclone: (clonedDoc) => {
                // Remove any temporary elements from clone
                clonedDoc.querySelectorAll('.tooltip').forEach(el => el.remove());
            }
        }).then(canvas => {
            // Create download link
            const link = document.createElement('a');
            link.download = 'diagram.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
            
            // Show the controls again
            controls.style.display = '';
        });
    }

    clearHighlights() {
        // Reset all lines to default style
        this.lines.forEach(line => {
            line.setOptions({
                color: '#666',
                size: 2
            });
        });
    }

    highlightRelationship(fieldDiv, tableName, fieldName) {
        // Clear previous highlights
        this.clearHighlights();

        // Find relationships involving this field
        const relationships = this.relationships.filter(rel => 
            (rel.from === tableName && rel.fromField === fieldName) ||
            (rel.to === tableName && rel.toField === fieldName)
        );

        if (relationships.length === 0) return;

        relationships.forEach(rel => {
            // Highlight the relationship line
            this.lines.forEach(line => {
                try {
                    const startElement = line.start?.element;
                    const endElement = line.end?.element;
                    
                    if (!startElement || !endElement) return;
                    
                    const startTableId = startElement.closest('[id]')?.id;
                    const endTableId = endElement.closest('[id]')?.id;
                    
                    if (!startTableId || !endTableId) return;
                    
                    const fromTable = startTableId.replace('table-', '');
                    const toTable = endTableId.replace('table-', '');
                    
                    if ((fromTable === rel.from && toTable === rel.to) ||
                        (fromTable === rel.to && toTable === rel.from)) {
                        line.setOptions({
                            color: '#3b82f6',
                            size: 3
                        });
                    }
                } catch (error) {
                    console.log('Skipping invalid line:', error);
                }
            });
        });
    }

    parseCode() {
        const code = this.codeEditor.value;
        const tables = new Map();
        const relationships = [];
        const errors = new Map(); // Store errors for each table field
        
        const tableDefinitions = code.split('Table').filter(t => t.trim());
        
        // First pass: collect all tables and their fields
        tableDefinitions.forEach(def => {
            const tableMatch = def.match(/(\w+)\s*{([^}]*)}/);
            if (tableMatch) {
                const tableName = tableMatch[1].trim();
                const fieldsStr = tableMatch[2];
                const fields = [];
                
                fieldsStr.split('\n').forEach(line => {
                    line = line.trim();
                    if (line) {
                        const [fieldName, ...rest] = line.split(' ');
                        const fieldDef = rest.join(' ');
                        
                        fields.push({
                            name: fieldName,
                            definition: fieldDef,
                            isPK: fieldDef.includes('[pk]'),
                            isFK: false,
                            hasError: false,
                            errorMessage: '',
                            note: fieldDef.match(/\[note:\s*(.*?)\]/)?.[1]
                        });
                    }
                });
                
                tables.set(tableName, fields);
            }
        });

        // Second pass: validate relationships
        tableDefinitions.forEach(def => {
            const tableMatch = def.match(/(\w+)\s*{([^}]*)}/);
            if (tableMatch) {
                const tableName = tableMatch[1].trim();
                const fieldsStr = tableMatch[2];
                
                fieldsStr.split('\n').forEach(line => {
                    line = line.trim();
                    if (line) {
                        const [fieldName, ...rest] = line.split(' ');
                        const fieldDef = rest.join(' ');
                        const refMatch = fieldDef.match(/\[ref:\s*([><])\s*(\w+)\.(\w+)\]/);
                        
                        if (refMatch) {
                            try {
                                const [_, type, targetTable, targetField] = refMatch;
                                const fields = tables.get(tableName);
                                const field = fields.find(f => f.name === fieldName);
                                
                                if (!field) return;
                                field.isFK = true; // Mark as FK even if it has an error
                                
                                // Check if target table exists
                                if (!tables.has(targetTable)) {
                                    field.hasError = true;
                                    field.errorMessage = `Referenced table '${targetTable}' does not exist`;
                                    return;
                                }
                                
                                // Check if target field exists and is a primary key
                                const targetFields = tables.get(targetTable);
                                if (!targetFields || !Array.isArray(targetFields)) {
                                    field.hasError = true;
                                    field.errorMessage = `Referenced table '${targetTable}' is invalid`;
                                    return;
                                }
                                
                                const targetFieldObj = targetFields.find(f => f.name === targetField);
                                if (!targetFieldObj) {
                                    field.hasError = true;
                                    field.errorMessage = `Referenced field '${targetField}' does not exist in table '${targetTable}'`;
                                    return;
                                }
                                
                                if (!targetFieldObj.isPK) {
                                    field.hasError = true;
                                    field.errorMessage = `Referenced field '${targetField}' is not a primary key`;
                                    return;
                                }
                                
                                // Valid relationship
                                relationships.push({
                                    from: tableName,
                                    to: targetTable,
                                    fromField: fieldName,
                                    toField: targetField,
                                    type
                                });
                            } catch (error) {
                                console.error('Error processing relationship:', error);
                                const fields = tables.get(tableName);
                                const field = fields.find(f => f.name === fieldName);
                                if (field) {
                                    field.hasError = true;
                                    field.errorMessage = 'Invalid relationship format';
                                    field.isFK = true;
                                }
                            }
                        }
                    }
                });
            }
        });
        
        // Third pass: validate field types
        tableDefinitions.forEach(def => {
            const tableMatch = def.match(/(\w+)\s*{([^}]*)}/);
            if (tableMatch) {
                const tableName = tableMatch[1].trim();
                const fieldsStr = tableMatch[2];
                
                fieldsStr.split('\n').forEach(line => {
                    line = line.trim();
                    if (line) {
                        try {
                            const [fieldName, ...rest] = line.split(' ');
                            const fieldDef = rest.join(' ');
                            const refMatch = fieldDef.match(/\[ref:\s*([><])\s*(\w+)\.(\w+)\]/);
                            
                            if (refMatch) {
                                const [_, type, targetTable, targetField] = refMatch;
                                const fields = tables.get(tableName);
                                const field = fields?.find(f => f.name === fieldName);
                                const targetFields = tables.get(targetTable);
                                const targetFieldObj = targetFields?.find(f => f.name === targetField);
                                
                                if (field && targetFieldObj) {
                                    const fieldType = fieldDef.replace(/\[.*?\]/g, '').trim();
                                    const targetFieldType = targetFieldObj.definition.replace(/\[.*?\]/g, '').trim();
                                    
                                    if (fieldType !== targetFieldType) {
                                        field.hasError = true;
                                        field.errorMessage = `Type mismatch: '${fieldType}' cannot reference '${targetFieldType}' in ${targetTable}.${targetField}`;
                                    }
                                }
                            }
                        } catch (error) {
                            console.error('Error validating field types:', error);
                        }
                    }
                });
            }
        });
        
        return { tables, relationships };
    }

    createTableElement(tableName, fields) {
        const table = document.createElement('div');
        table.className = 'absolute bg-white rounded-lg shadow-lg min-w-[250px]';
        table.id = `table-${tableName}`;
        
        // Table header
        const header = document.createElement('div');
        header.className = 'font-bold text-lg mb-2 bg-gray-100 p-2 rounded flex justify-between items-center';
        
        const titleContainer = document.createElement('div');
        titleContainer.className = 'flex items-center gap-2';

        // Add dropdown menu
        const dropdownContainer = document.createElement('div');
        dropdownContainer.className = 'relative';
        
        const dropdownButton = document.createElement('button');
        dropdownButton.className = 'text-white hover:text-gray-400 focus:outline-none';
        dropdownButton.innerHTML = '<i class="fas fa-ellipsis-v"></i>';
        
        const dropdownMenu = document.createElement('div');
        dropdownMenu.className = 'absolute left-0 mt-2 bg-white rounded-lg shadow-lg py-1 z-50 hidden min-w-[120px] text-sm text-gray-700';
        
        const lockOption = document.createElement('button');
        lockOption.className = 'w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center';
        this.updateLockOption(lockOption, tableName);
        
        dropdownMenu.appendChild(lockOption);
        dropdownContainer.appendChild(dropdownButton);
        dropdownContainer.appendChild(dropdownMenu);
        
        // Add click handler for dropdown
        dropdownButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const wasHidden = dropdownMenu.classList.contains('hidden');
            // Hide all other dropdowns
            document.querySelectorAll('.absolute.left-0.mt-2').forEach(menu => 
                menu.classList.add('hidden')
            );
            dropdownMenu.classList.toggle('hidden', !wasHidden);
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', () => {
            dropdownMenu.classList.add('hidden');
        });

        const title = document.createElement('span');
        title.textContent = tableName;
        
        // Add lock icon (hidden by default)
        const lockIcon = document.createElement('i');
        lockIcon.className = 'fas fa-lock text-gray-400 hidden';
        lockIcon.id = `lock-${tableName}`;

        titleContainer.appendChild(dropdownContainer);
        titleContainer.appendChild(title);
        titleContainer.appendChild(lockIcon);
        
        const count = document.createElement('span');
        count.className = 'text-xs bg-indigo-600 text-white px-2 py-1 rounded-full';
        count.textContent = `${fields.length} fields`;
        
        header.appendChild(titleContainer);
        header.appendChild(count);
        table.appendChild(header);
        
        // Fields
        fields.forEach(field => {
            const fieldDiv = document.createElement('div');
            fieldDiv.className = `py-1 px-2 flex justify-between items-center hover:bg-gray-50 cursor-pointer rounded
                ${field.hasError ? 'bg-red-50 hover:bg-red-100' : ''}`;
            fieldDiv.setAttribute('data-field', field.name);

            // Add click handler for highlighting relationships
            fieldDiv.addEventListener('click', (e) => {
                e.stopPropagation();
                
                // Clear previous highlights
                document.querySelectorAll('.highlight').forEach(el => {
                    el.classList.remove('highlight', 'bg-blue-100');
                });
                
                if (field.hasError) {
                    // Remove any existing tooltips
                    document.querySelectorAll('.error-tooltip').forEach(tooltip => {
                        tooltip.remove();
                    });

                    // Show error tooltip
                    const tooltip = document.createElement('div');
                    tooltip.className = 'error-tooltip absolute z-50 bg-red-500 text-white p-2 rounded shadow-lg text-sm';
                    tooltip.style.left = (e.clientX + 10) + 'px';
                    tooltip.style.top = (e.clientY + 10) + 'px';
                    tooltip.textContent = field.errorMessage;
                    document.body.appendChild(tooltip);

                    // Remove tooltip after 3 seconds or on click anywhere
                    const removeTooltip = () => {
                        if (document.body.contains(tooltip)) {
                            document.body.removeChild(tooltip);
                        }
                        document.removeEventListener('click', removeTooltip);
                    };
                    setTimeout(removeTooltip, 3000);
                    document.addEventListener('click', removeTooltip, { once: true });
                } else if (field.isFK) {
                    // Find the relationship
                    const rel = this.relationships.find(r => 
                        (r.from === tableName && r.fromField === field.name) ||
                        (r.to === tableName && r.toField === field.name)
                    );
                    
                    if (rel) {
                        // Highlight both fields
                        const fromField = document.querySelector(`#table-${rel.from} [data-field="${rel.fromField}"]`);
                        const toField = document.querySelector(`#table-${rel.to} [data-field="${rel.toField}"]`);
                        
                        if (fromField) {
                            fromField.classList.add('highlight', 'bg-blue-100');
                        }
                        if (toField) {
                            toField.classList.add('highlight', 'bg-blue-100');
                        }
                        
                        // Highlight the line
                        this.lines.forEach(line => {
                            const startElement = line.start?.element;
                            const endElement = line.end?.element;
                            
                            if (!startElement || !endElement) return;
                            
                            const startTableId = startElement.closest('[id]')?.id;
                            const endTableId = endElement.closest('[id]')?.id;
                            
                            if (!startTableId || !endTableId) return;
                            
                            const fromTable = startTableId.replace('table-', '');
                            const toTable = endTableId.replace('table-', '');
                            
                            if ((fromTable === rel.from && toTable === rel.to) ||
                                (fromTable === rel.to && toTable === rel.from)) {
                                line.setOptions({
                                    color: '#3b82f6',
                                    size: 3
                                });
                            }
                        });
                    }
                }
            });

            // Create field name container with icons
            const nameContainer = document.createElement('div');
            nameContainer.className = 'flex items-center gap-2';

            // Add icons
            if (field.isPK) {
                const pkIcon = document.createElement('i');
                pkIcon.className = 'fas fa-key text-amber-500';
                nameContainer.appendChild(pkIcon);
            }
            if (field.isFK) {
                const fkIcon = document.createElement('i');
                fkIcon.className = `fas fa-link ${field.hasError ? 'text-red-500' : 'text-blue-500'}`;
                nameContainer.appendChild(fkIcon);
            }
            if (field.note) {
                const noteIcon = document.createElement('i');
                noteIcon.className = 'fas fa-comment ml-2 text-blue-500 cursor-help';
                noteIcon.title = field.note;
                nameContainer.appendChild(noteIcon);
                
                // Add tooltip functionality
                fieldDiv.addEventListener('mouseenter', () => {
                    const tooltip = document.createElement('div');
                    tooltip.className = 'tooltip absolute bg-gray-800 text-white p-2 rounded shadow-lg text-sm';
                    tooltip.textContent = field.note;
                    tooltip.style.left = '100%';
                    // tooltip.style.top = '50%';
                    // tooltip.style.transform = 'translateY(-50%)';
                    tooltip.style.marginLeft = '10px';
                    tooltip.style.zIndex = '100';
                    // tooltip.style.maxWidth = '200px';
                    tooltip.style.whiteSpace = 'nowrap';
                    fieldDiv.appendChild(tooltip);
                });
                
                fieldDiv.addEventListener('mouseleave', () => {
                    const tooltip = fieldDiv.querySelector('.tooltip');
                    if (tooltip) {
                        tooltip.remove();
                    }
                });
            }

            // Add field name
            const nameSpan = document.createElement('span');
            nameSpan.className = `font-mono ${field.hasError ? 'text-red-600' : ''}`;
            nameSpan.textContent = field.name;
            nameContainer.appendChild(nameSpan);

            // Add field type
            const typeSpan = document.createElement('span');
            typeSpan.className = `text-gray-600 ${field.hasError ? 'text-red-400' : ''}`;
            typeSpan.textContent = field.definition.replace(/\[.*?\]/g, '').trim();

            if (field.hasError) {
                const errorIcon = document.createElement('i');
                errorIcon.className = 'fas fa-exclamation-circle text-red-500 mx-1';
                typeSpan.appendChild(errorIcon);
            }

            fieldDiv.appendChild(nameContainer);
            fieldDiv.appendChild(typeSpan);
            table.appendChild(fieldDiv);
        });
        
        this.makeTableDraggable(table);
        return table;
    }

    saveTablePosition(tableName, x, y) {
        const oldPosition = this.tablePositions.get(tableName);
        // Only save if position actually changed
        if (!oldPosition || oldPosition.x !== x || oldPosition.y !== y) {
            this.tablePositions.set(tableName, { x, y });
            // Save to storage when table positions change
            this.storage.setItem('diagram', {
                content: this.codeEditor.value,
                positions: Object.fromEntries(this.tablePositions)
            });
        }
    }

    getTablePosition(tableName) {
        return this.tablePositions.get(tableName);
    }

    generateDiagram() {
        // Clear the diagram
        this.diagram.innerHTML = '';
        this.lines.forEach(line => line.remove());
        this.lines = [];
        
        const { tables, relationships } = this.parseCode();
        this.tables = tables;
        this.relationships = relationships;
        
        let offsetX = 50;
        let offsetY = 50;
        
        tables.forEach((fields, tableName) => {
            const tableEl = this.createTableElement(tableName, fields);
            
            // Use stored position or default to grid layout
            const pos = this.tablePositions.get(tableName);
            if (pos) {
                tableEl.style.left = pos.x + 'px';
                tableEl.style.top = pos.y + 'px';
            } else {
                tableEl.style.left = offsetX + 'px';
                tableEl.style.top = offsetY + 'px';
                this.tablePositions.set(tableName, { x: offsetX, y: offsetY });
                
                offsetX += 300;
                if (offsetX > 900) {
                    offsetX = 50;
                    offsetY += 300;
                }
            }
            
            this.diagram.appendChild(tableEl);
        });
        
        setTimeout(() => this.drawRelationships(), 100);
    }

    makeTableDraggable(tableEl) {
        let isDragging = false;
        let currentX;
        let currentY;
        let initialX;
        let initialY;
        let startX;
        let startY;
        const tableName = tableEl.id.replace('table-', '');
        
        tableEl.addEventListener('mousedown', (e) => {
            // Only allow dragging from the header and if table is not locked
            const header = e.target.closest('.bg-gray-100');
            if (header && !this.lockedTables.has(tableName)) {
                isDragging = true;
                startX = parseInt(tableEl.style.left) || 0;
                startY = parseInt(tableEl.style.top) || 0;
                initialX = e.clientX - startX;
                initialY = e.clientY - startY;
                // Remove animation class during drag
                tableEl.classList.remove('table-animated');
            }
        });
        
        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                e.preventDefault();
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;
                
                tableEl.style.left = currentX + 'px';
                tableEl.style.top = currentY + 'px';
                
                this.drawRelationships();
            }
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                // Only add to history if the position actually changed
                if (startX !== currentX || startY !== currentY) {
                    this.tablePositions.set(tableName, { x: currentX, y: currentY });
                    this.addToHistory('move');
                    this.storage.setItem('diagram', {
                        content: this.codeEditor.value,
                        positions: Object.fromEntries(this.tablePositions)
                    });
                }
            }
        });
    }

    initZoomControls() {
        // Create zoom controls container
        const zoomControls = document.createElement('div');
        zoomControls.className = 'zoom-controls';
        
        // Zoom out button
        const zoomOutBtn = document.createElement('button');
        zoomOutBtn.className = 'zoom-button';
        zoomOutBtn.innerHTML = '−';
        zoomOutBtn.onclick = () => this.setZoom(this.scale - 0.1);
        
        // Zoom slider
        const zoomSlider = document.createElement('input');
        zoomSlider.type = 'range';
        zoomSlider.className = 'zoom-slider';
        zoomSlider.min = '0.5';
        zoomSlider.max = '2';
        zoomSlider.step = '0.1';
        zoomSlider.value = '1';
        zoomSlider.oninput = (e) => this.setZoom(parseFloat(e.target.value));
        
        // Zoom percentage text
        const zoomText = document.createElement('span');
        zoomText.className = 'zoom-text';
        zoomText.textContent = '100%';
        
        // Zoom in button
        const zoomInBtn = document.createElement('button');
        zoomInBtn.className = 'zoom-button';
        zoomInBtn.innerHTML = '+';
        zoomInBtn.onclick = () => this.setZoom(this.scale + 0.1);
        
        // Add elements to container
        zoomControls.appendChild(zoomOutBtn);
        zoomControls.appendChild(zoomSlider);
        zoomControls.appendChild(zoomText);
        zoomControls.appendChild(zoomInBtn);
        
        // Add to document
        document.body.appendChild(zoomControls);
        
        // Store references
        this.zoomSlider = zoomSlider;
        this.zoomText = zoomText;
    }

    setZoom(scale) {
        // Clamp scale between 0.5 and 2
        this.scale = Math.min(Math.max(scale, 0.5), 2);
        
        // Update all tables
        const tables = this.diagram.querySelectorAll('.absolute');
        tables.forEach(table => {
            table.style.transform = `scale(${this.scale})`;
            table.style.transformOrigin = '0 0';
        });
        
        // Update zoom controls
        this.zoomSlider.value = this.scale;
        this.zoomText.textContent = Math.round(this.scale * 100) + '%';
        
        // Update relationship lines
        this.drawRelationships();
    }

    initCanvasDrag() {
        this.diagram.addEventListener('mousedown', (e) => {
            // Only start dragging if clicking empty space
            if (e.target === this.diagram) {
                this.isDraggingCanvas = true;
                this.lastX = e.clientX;
                this.lastY = e.clientY;
                this.diagram.style.cursor = 'grabbing';
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (this.isDraggingCanvas) {
                const dx = e.clientX - this.lastX;
                const dy = e.clientY - this.lastY;
                
                this.canvasX += dx;
                this.canvasY += dy;
                
                this.lastX = e.clientX;
                this.lastY = e.clientY;
                
                // Move all tables together
                const tables = this.diagram.querySelectorAll('.absolute');
                tables.forEach(table => {
                    const left = parseInt(table.style.left) || 0;
                    const top = parseInt(table.style.top) || 0;
                    table.style.left = (left + dx) + 'px';
                    table.style.top = (top + dy) + 'px';
                });
                
                // Update relationships
                this.drawRelationships();
            }
        });

        document.addEventListener('mouseup', () => {
            if (this.isDraggingCanvas) {
                this.isDraggingCanvas = false;
                this.diagram.style.cursor = 'default';
                
                // Save new positions
                const tables = this.diagram.querySelectorAll('.absolute');
                tables.forEach(table => {
                    const tableName = table.id.replace('table-', '');
                    this.saveTablePosition(tableName,
                        parseInt(table.style.left) || 0,
                        parseInt(table.style.top) || 0
                    );
                });
            }
        });
    }

    setupLeaderLineContainer() {
        // Watch for leader-line container creation
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.classList && node.classList.contains('leader-line-wrapper-div')) {
                        node.style.overflow = 'visible';
                        node.style.position = 'absolute';
                        node.style.pointerEvents = 'none';
                        node.style.zIndex = '1';
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Fix any existing leader-line containers
        document.querySelectorAll('.leader-line-wrapper-div').forEach(container => {
            container.style.overflow = 'visible';
            container.style.position = 'absolute';
            container.style.pointerEvents = 'none';
            container.style.zIndex = '1';
        });
    }

    drawRelationships() {
        // Remove existing lines
        this.lines.forEach(line => line.remove());
        this.lines = [];
        
        this.relationships.forEach(rel => {
            const fromTable = document.getElementById(`table-${rel.from}`);
            const toTable = document.getElementById(`table-${rel.to}`);
            
            if (fromTable && toTable) {
                // Find the specific field elements
                const fromField = fromTable.querySelector(`[data-field="${rel.fromField}"]`);
                const toField = toTable.querySelector(`[data-field="${rel.toField}"]`);
                
                if (!fromField || !toField) return;

                // Get the rectangles for the fields and tables
                const fromRect = fromField.getBoundingClientRect();
                const toRect = toField.getBoundingClientRect();
                const fromTableRect = fromTable.getBoundingClientRect();
                const toTableRect = toTable.getBoundingClientRect();
                
                // Calculate relative positions of fields within their tables
                const fromFieldRelativeY = (fromRect.top + fromRect.height/2) - fromTableRect.top;
                const toFieldRelativeY = (toRect.top + toRect.height/2) - toTableRect.top;
                
                // Determine if connection should be from left or right based on table positions
                const fromCenter = fromTableRect.left + fromTableRect.width/2;
                const toCenter = toTableRect.left + toTableRect.width/2;
                
                let startSocket, endSocket;
                let startAnchor, endAnchor;                
                
                if (fromCenter < toCenter) {
                    // From table is on the left
                    startSocket = 'right';
                    endSocket = 'left';
                    startAnchor = LeaderLine.pointAnchor(fromTable, {
                        x: '100%',
                        y: (fromFieldRelativeY / fromTableRect.height) * 100 + '%'
                    });
                    endAnchor = LeaderLine.pointAnchor(toTable, {
                        x: '0%',
                        y: (toFieldRelativeY / toTableRect.height) * 100 + '%'
                    });
                }
                else {                    
                    // From table is on the right
                    startSocket = 'left';
                    endSocket = 'right';                    
                    startAnchor = LeaderLine.pointAnchor(fromTable, {
                        x: '0%',
                        y: (fromFieldRelativeY / fromTableRect.height) * 100 + '%'
                    });
                    endAnchor = LeaderLine.pointAnchor(toTable, {
                        x: '100%',
                        y: (toFieldRelativeY / toTableRect.height) * 100 + '%'
                    });
                }

                const line = new LeaderLine(
                    startAnchor,
                    endAnchor,
                    {
                        color: '#666',
                        size: 2,
                        startPlug: 'disc',
                        endPlug: rel.type === '>' ? 'arrow1' : 'disc',
                        path: 'grid',
                        startSocket,
                        endSocket,
                    }
                );
                this.lines.push(line);
            }
        });
    }

    addToHistory(action) {
        // Get current state
        const currentState = {
            content: this.codeEditor.value,
            positions: new Map(Array.from(this.tablePositions.entries())),
            action: action
        };

        // Don't add if nothing changed
        if (this.history.length > 0) {
            const lastState = this.history[this.currentHistoryIndex];
            if (lastState && 
                lastState.content === currentState.content && 
                JSON.stringify(Array.from(lastState.positions.entries())) === 
                JSON.stringify(Array.from(currentState.positions.entries()))) {
                return;
            }
        }

        // Remove any future history if we're not at the latest point
        if (this.currentHistoryIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.currentHistoryIndex + 1);
        }

        // Add current state to history
        this.history.push(currentState);
        this.currentHistoryIndex++;

        // Keep history size in check
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
            this.currentHistoryIndex--;
        }

        this.updateUndoRedoButtons();
    }

    undo() {
        if (this.currentHistoryIndex > 0) {
            this.currentHistoryIndex--;
            this.applyHistoryState(this.history[this.currentHistoryIndex]);
        }
    }

    redo() {
        if (this.currentHistoryIndex < this.history.length - 1) {
            this.currentHistoryIndex++;
            this.applyHistoryState(this.history[this.currentHistoryIndex]);
        }
    }

    applyHistoryState(state) {
        if (!state) return;

        const prevPositions = new Map(this.tablePositions);
        const prevContent = this.codeEditor.value;

        // Apply the text content
        this.codeEditor.value = state.content;
        
        // Apply the table positions
        this.tablePositions = new Map(state.positions);
        
        // Update storage
        this.storage.setItem('diagram', {
            content: state.content,
            positions: Object.fromEntries(state.positions)
        });

        // Regenerate the diagram with new positions
        this.generateDiagram();
        
        // Highlight changes
        if (state.action === 'move') {
            // Find which tables changed position
            this.tablePositions.forEach((pos, tableName) => {
                const prevPos = prevPositions.get(tableName);
                if (!prevPos || prevPos.x !== pos.x || prevPos.y !== pos.y) {
                    const tableEl = document.getElementById(`table-${tableName}`);
                    if (tableEl) {
                        // Add animation class for smooth movement
                        tableEl.classList.add('table-animated');
                        // Add highlight effect
                        tableEl.classList.remove('table-highlight');
                        void tableEl.offsetWidth;
                        tableEl.classList.add('table-highlight');
                        // Remove animation class after transition
                        setTimeout(() => {
                            tableEl.classList.remove('table-animated');
                        }, 300);
                    }
                }
            });
        } else {
            // Text change animation
            if (prevContent !== state.content) {
                this.codeEditor.classList.remove('text-highlight');
                void this.codeEditor.offsetWidth;
                this.codeEditor.classList.add('text-highlight');
            }
        }

        this.updateUndoRedoButtons();
    }

    updateUndoRedoButtons() {
        this.undoBtn.disabled = this.currentHistoryIndex <= 0;
        this.redoBtn.disabled = this.currentHistoryIndex >= this.history.length - 1;
        
        // Update status text
        if (this.history.length === 0) {
            this.historyStatus.textContent = 'No changes';
        } else {
            const action = this.history[this.currentHistoryIndex]?.action === 'move' ? 'Move' : 'Edit';
            this.historyStatus.textContent = `${action} ${this.currentHistoryIndex + 1} of ${this.history.length}`;
        }
    }

    updateLockOption(lockOption, tableName) {
        const isLocked = this.lockedTables.has(tableName);
        lockOption.innerHTML = isLocked ? 
            '<i class="fas fa-unlock mr-2"></i> Unlock Table' : 
            '<i class="fas fa-lock mr-2"></i> Lock Table';
        
        lockOption.onclick = (e) => {
            e.stopPropagation();
            if (isLocked) {
                this.lockedTables.delete(tableName);
            } else {
                this.lockedTables.add(tableName);
            }
            // Update lock icon
            const lockIcon = document.getElementById(`lock-${tableName}`);
            if (lockIcon) {
                lockIcon.classList.toggle('hidden', !this.lockedTables.has(tableName));
            }
            // Update cursor style
            const tableEl = document.getElementById(`table-${tableName}`);
            if (tableEl) {
                const header = tableEl.querySelector('.bg-gray-100');
                if (header) {
                    header.style.cursor = this.lockedTables.has(tableName) ? 'not-allowed' : 'move';
                }
            }
            // Save locked state
            this.storage.setItem('lockedTables', Array.from(this.lockedTables));
            // Update the option text/icon
            this.updateLockOption(lockOption, tableName);
            // Hide dropdown
            const dropdown = lockOption.closest('.absolute.left-0.mt-2');
            if (dropdown) dropdown.classList.add('hidden');
        };
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new TableDiagram();
});
