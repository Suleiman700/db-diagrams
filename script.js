class TableDiagram {
    constructor() {
        this.codeEditor = document.getElementById('codeEditor');
        this.diagram = document.getElementById('diagram');
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

        // Initialize zoom controls
        this.initZoomControls();
        
        // Initialize canvas dragging
        this.initCanvasDrag();

        // Initialize button controls
        this.initButtonControls();

        // Handle LeaderLine container
        this.setupLeaderLineContainer();

        // Add input event for real-time updates
        this.codeEditor.addEventListener('input', () => {
            if (this.updateTimeout) {
                clearTimeout(this.updateTimeout);
            }
            this.updateTimeout = setTimeout(() => {
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
                this.tablePositions.set(tableName, { x, y });
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
        
        const title = document.createElement('span');
        title.textContent = tableName;
        
        const count = document.createElement('span');
        count.className = 'text-xs bg-indigo-600 text-white px-2 py-1 rounded-full';
        count.textContent = `${fields.length} fields`;
        
        header.appendChild(title);
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
                    tooltip.className = 'tooltip absolute bg-gray-800 text-white px-3 py-2 rounded text-sm';
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
        this.tablePositions.set(tableName, { x, y });
    }

    getTablePosition(tableName) {
        return this.tablePositions.get(tableName);
    }

    generateDiagram() {
        // Store current positions before clearing
        const currentTables = document.querySelectorAll('[id^="table-"]');
        currentTables.forEach(table => {
            const tableName = table.id.replace('table-', '');
            this.saveTablePosition(tableName, 
                parseInt(table.style.left) || 0,
                parseInt(table.style.top) || 0
            );
        });

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
            const pos = this.getTablePosition(tableName);
            if (pos) {
                tableEl.style.left = pos.x + 'px';
                tableEl.style.top = pos.y + 'px';
            } else {
                tableEl.style.left = offsetX + 'px';
                tableEl.style.top = offsetY + 'px';
                this.saveTablePosition(tableName, offsetX, offsetY);
                
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
        const tableName = tableEl.id.replace('table-', '');
        
        tableEl.addEventListener('mousedown', (e) => {
            // Only allow dragging from the header
            const header = e.target.closest('.bg-gray-100');
            if (header) {
                isDragging = true;
                initialX = e.clientX - tableEl.offsetLeft;
                initialY = e.clientY - tableEl.offsetTop;
            }
        });
        
        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                e.preventDefault();
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;
                
                tableEl.style.left = currentX + 'px';
                tableEl.style.top = currentY + 'px';
                
                // Save the new position
                this.saveTablePosition(tableName, currentX, currentY);
                
                this.drawRelationships();
            }
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
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
                } else {
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
                        endSocket
                    }
                );
                this.lines.push(line);
            }
        });
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new TableDiagram();
});
