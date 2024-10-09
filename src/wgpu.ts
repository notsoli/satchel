let device: GPUDevice
let bindGroup: GPUBindGroup
let pipelineLayout: GPUPipelineLayout
let renderPipeline: GPURenderPipeline
let frameBuffer: GPUBuffer, vertexBuffer: GPUBuffer

let canvas: HTMLCanvasElement
let ctx: GPUCanvasContext

let frame = 0

export async function init(targetCanvas: HTMLCanvasElement) {
    canvas = targetCanvas

    if (!navigator.gpu) { throw Error("WebGPU not supported.") }

    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) { throw Error("Couldn't request WebGPU adapter.") }

    device = await adapter.requestDevice()

    const bindGroupLayoutEntry: GPUBindGroupLayoutEntry = {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' }
    }

    frameBuffer = device.createBuffer({
        size: 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    })
    
    const bindGroupEntry = {
        binding: 0,
        resource: {
            buffer: frameBuffer
        }
    }

    const defaultBindGroupLayout = device.createBindGroupLayout({
        entries: [ bindGroupLayoutEntry ]
    })

    pipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [ defaultBindGroupLayout ]
    })

    bindGroup = device.createBindGroup({
        layout: defaultBindGroupLayout,
        entries: [ bindGroupEntry ]
    })
}

export async function compile(fragment: string) {
    const vertex = `
        @vertex
        fn vertex_main(@location(0) pos : vec2f) ->  @builtin(position) vec4f {
            return vec4f(pos, 0., 1.); 
        }
    `

    const shaderModule = device.createShaderModule({
        code: vertex + fragment
    })

    ctx = canvas.getContext("webgpu")!
    ctx.configure({
        device: device,
        format: navigator.gpu.getPreferredCanvasFormat(),
        alphaMode: "premultiplied",
    })

    const verts = new Float32Array([
        -1.0, -1.0,
        1.0, -1.0,
        1.0, 1.0,
        1.0, 1.0,
        -1.0, 1.0,
        -1.0, -1.0
    ])

    vertexBuffer = device.createBuffer({
        size: verts.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    })
    device.queue.writeBuffer(vertexBuffer, 0, verts, 0, verts.length) 
    
    const vertexBuffers: GPUVertexBufferLayout[] = [
        {
            attributes: [
                { shaderLocation: 0, offset: 0, format: "float32x2"}
            ],
            arrayStride: 8,
            stepMode: "vertex",
        },
    ]

    const vertexState: GPUVertexState = { module: shaderModule, entryPoint: "vertex_main", buffers: vertexBuffers }
    const fragmentState: GPUFragmentState = {
        module: shaderModule, entryPoint: "fragment_main",
        targets: [{ format: navigator.gpu.getPreferredCanvasFormat() }]
    }
    const pipelineDescriptor: GPURenderPipelineDescriptor = {
        vertex: vertexState,
        fragment: fragmentState,
        primitive: { topology: "triangle-list" },
        layout: pipelineLayout
    }
    renderPipeline = device.createRenderPipeline(pipelineDescriptor)

    requestAnimationFrame(render)
}

function render() {
    device.queue.writeBuffer(frameBuffer, 0, new Float32Array([frame++]))


    const commandEncoder = device.createCommandEncoder()

    // background color
    const clearColor = { r: 0.0, g: 0.0, b: 0.0, a: 1.0 }

    const renderPassDescriptor: GPURenderPassDescriptor = {
        colorAttachments: [{
            clearValue: clearColor,
            loadOp: "clear",
            storeOp: "store",
            view: ctx.getCurrentTexture().createView()
        }
    ]}

    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor)
    passEncoder.setPipeline(renderPipeline)
    passEncoder.setBindGroup(0, bindGroup)
    passEncoder.setVertexBuffer(0, vertexBuffer)

    passEncoder.draw(6)
    passEncoder.end()
    device.queue.submit([commandEncoder.finish()])

    requestAnimationFrame(render)
}