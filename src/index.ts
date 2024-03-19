import { getImage } from "./images";

async function main() {
  const sliders = document.querySelectorAll<HTMLInputElement>(
    'input[type="range"]',
  );

  sliders.forEach((slider) => {
    slider.addEventListener("input", () => {
      render();
    });
  });

  function getUniforms() {
    return new Float32Array(
      Array.from(sliders).map((s) => parseFloat(s.value)),
    );
  }

  const image = await getImage();
  console.log("image", image);

  const adapter = await navigator.gpu.requestAdapter();
  console.log("adapter", adapter);

  const device = await adapter?.requestDevice({
    requiredFeatures: ["float32-filterable"],
    requiredLimits: {
      maxBufferSize: 1024 * 1024 * 1024 * 2,
    },
  });
  console.log("device", device);

  const canvas = document.querySelector<HTMLCanvasElement>("#canvas");
  if (!canvas) {
    throw new Error(`canvas not found`);
  }

  if (!device) {
    throw new Error("could not initialize module");
  }

  const ctx = canvas.getContext("webgpu");
  if (!ctx) {
    throw new Error(`could not initialize canvas for webgpu`);
  }

  const format = navigator.gpu.getPreferredCanvasFormat();

  ctx.configure({
    device,
    format,
  });

  const module = device?.createShaderModule({
    code: `

struct Out {
  @builtin(position) position: vec4f,
  @location(0) pos: vec4f
}

@vertex
fn vertex_shader (@builtin(vertex_index) index: u32) -> Out {

   let points = array(
     vec4f(1,-1,0,1),
     vec4f(-1,1,0,1),
     vec4f(-1,-1,0,1),

     vec4f(1,-1,0,1),
     vec4f(-1,1,0,1),
     vec4f(1,1,0,1)
   );

   return Out(points[index], points[index]);
}


struct Uniforms {
  slice: f32,
  level: f32,
  width: f32,
  rotation: f32
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var volumeTexture: texture_3d<f32>;
@group(0) @binding(2) var volumeSampler: sampler;


fn transfer (hu: f32, light: vec3f, dhu: vec3f) -> vec4f {

  let eye = normalize(vec3f(0,1,0));

  let normal = normalize(dhu);

  if -20 < hu && hu < 20 {
    let a = .02 * (hu+20) / 40;
    return vec4f(0,0,1,0) * a;
    }

  if (-150 < hu && hu < -20) {
    let diffuseIdx = max(0, dot(normal, -light));
    let a = 0.01;
    let diffuse = vec3f(diffuseIdx*255,diffuseIdx*226,diffuseIdx*198) / 255;
    return vec4(diffuse*a, a);
  }

  if (13 < hu && hu < 75) {
    let diffuseIdx = max(0, dot(normal, -light));
    let diffuse = vec4f(diffuseIdx, 0, 0, 1);
    let a = .02 * (hu-13)/75;
    return diffuse * vec4f(1,0,0,0) * a;
  }

  if (300 < hu && hu > 400) {
    let diffuseIdx = max(0, dot(normal, -light));
    let diffuse = vec4f(diffuseIdx, diffuseIdx, diffuseIdx, .8);
    let ambience = vec4f(.2, .2, .2, .2);

    let specular = vec4f(pow(max(0, dot(reflect(light, normal), eye)), 5));

    return .1*ambience + .1*diffuse + .02*specular;
  }

  return vec4f(0);
}


@fragment
fn fragment_shader (@location(0) p: vec4f) -> @location(0) vec4f {

  var out: vec4f;

  let angle = uniforms.rotation * 2 * 3.1416;

  let M = mat4x4f(
		  cos(angle), -sin(angle),  0, 0,
		  sin(angle), cos(angle),   0, 0,
                  0, 0, 1, 0,
		  0, 0, 0, 1
  );

  let light = normalize(vec4f(1,0,0,0)).xyz;

  for (var i=uniforms.slice; i<1.; i+=0.01) {
    let pos = vec4f((p.xyz + 1.) / 2. + vec3f(0,0,i), 1.);

    let offset = vec4(.5,.5,.5,0);

    let textureCoord = ((M*(pos - offset).xzyw) + offset).xyz;
    let hu = textureSample(volumeTexture, volumeSampler, textureCoord).r;

    let h = 0.01;

    let grad = vec3f(
      (textureSample(volumeTexture, volumeSampler, textureCoord + vec3f(h, 0, 0)).r - hu) / h,
      (textureSample(volumeTexture, volumeSampler, textureCoord + vec3f(0, h, 0)).r - hu) / h,
      (textureSample(volumeTexture, volumeSampler, textureCoord + vec3f(0, 0, h)).r - hu) / h
    );

    let color = transfer(hu, light, grad);
    out = out + (1-out.a) * color;
  }

  return out;
}

`,
  });

  const volumeSampler = device.createSampler({
    minFilter: "linear",
    magFilter: "linear",
  });

  const volumeTexture = device.createTexture({
    format: "r32float",
    dimension: "3d",
    size: [image.columns, image.rows, image.slices],
    usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
  });

  device.queue.writeTexture(
    { texture: volumeTexture },
    image.volume,
    {
      bytesPerRow: image.columns * Float32Array.BYTES_PER_ELEMENT,
      rowsPerImage: image.rows,
    },
    [image.columns, image.rows, image.slices],
  );

  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module,
    },
    fragment: {
      module,
      targets: [{ format }],
    },
  });

  const uniformsBuffer = device.createBuffer({
    size: Float32Array.BYTES_PER_ELEMENT * sliders.length,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: {
          buffer: uniformsBuffer,
        },
      },
      {
        binding: 1,
        resource: volumeTexture.createView(),
      },
      {
        binding: 2,
        resource: volumeSampler,
      },
    ],
  });

  const render = () => {
    device.queue.writeBuffer(uniformsBuffer, 0, getUniforms());
    const encoder = device.createCommandEncoder();

    const canvasTexture = ctx.getCurrentTexture();

    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: canvasTexture.createView(),
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(6);
    pass.end();

    const commandBuffer = encoder.finish();

    device.queue.submit([commandBuffer]);
  };

  render();
}

main();
